import "server-only";

import Stripe from "stripe";
import {
  claimWebhookEvent,
  findCheckoutByProviderReference,
  finishWebhookEvent,
  settleProviderPayment,
  syncProviderInvoice,
  syncProviderRefund,
  syncProviderSubscription,
} from "@/lib/billing/service";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function unixDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1_000) : null;
}

export async function processStripeWebhook(event: Stripe.Event): Promise<void> {
  const claimed = await claimWebhookEvent({
    provider: "stripe",
    providerEventId: event.id,
    eventType: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (!claimed.process) return;

  try {
    const object = asRecord(event.data.object);
    const metadata = asRecord(object.metadata);
    const checkoutId = asString(metadata.checkoutId);

    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutReference = asString(object.id);
        const paymentIntent = asString(object.payment_intent);
        const subscriptionId = asString(object.subscription);
        const customerId = asString(object.customer);
        if (checkoutReference && paymentIntent) {
          await settleProviderPayment({
            provider: "stripe",
            providerCheckoutId: checkoutReference,
            providerPaymentId: paymentIntent,
            amountMinor: asNumber(object.amount_total),
            currency: asString(object.currency) ?? "INR",
            providerSubscriptionId: subscriptionId,
            providerCustomerId: customerId,
          });
        }
        if (checkoutId && subscriptionId) {
          await syncProviderSubscription({
            provider: "stripe",
            providerSubscriptionId: subscriptionId,
            providerCustomerId: customerId,
            checkoutId,
            status: "active",
          });
        }
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntentId = asString(object.id);
        const paymentMetadata = asRecord(object.metadata);
        const checkoutReference = asString(paymentMetadata.checkoutId) ?? paymentIntentId;
        if (checkoutReference && paymentIntentId) {
          await settleProviderPayment({
            provider: "stripe",
            providerCheckoutId: checkoutReference,
            providerPaymentId: paymentIntentId,
            amountMinor: asNumber(object.amount_received) || asNumber(object.amount),
            currency: asString(object.currency) ?? "INR",
            providerCustomerId: asString(object.customer),
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscriptionId = asString(object.id);
        if (subscriptionId) {
          await syncProviderSubscription({
            provider: "stripe",
            providerSubscriptionId: subscriptionId,
            providerCustomerId: asString(object.customer),
            checkoutId,
            status: asString(object.status) ?? (event.type === "customer.subscription.deleted" ? "canceled" : "active"),
            currentPeriodEndsAt: unixDate(object.current_period_end),
            cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
            metadata,
          });
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoiceId = asString(object.id);
        if (invoiceId) {
          await syncProviderInvoice({
            provider: "stripe",
            providerInvoiceId: invoiceId,
            providerSubscriptionId: asString(object.subscription),
            providerCustomerId: asString(object.customer),
            status: asString(object.status) ?? (event.type === "invoice.payment_failed" ? "open" : "paid"),
            amountPaidMinor: asNumber(object.amount_paid),
            amountDueMinor: asNumber(object.amount_due),
            currency: asString(object.currency) ?? "INR",
            hostedInvoiceUrl: asString(object.hosted_invoice_url),
            invoicePdfUrl: asString(object.invoice_pdf),
            dueAt: unixDate(object.due_date),
            paidAt: event.type === "invoice.payment_failed" ? null : new Date(),
          });
        }
        break;
      }
      case "charge.refunded":
      case "refund.created":
      case "refund.updated": {
        const refundId = asString(object.id);
        if (refundId) {
          await syncProviderRefund({
            provider: "stripe",
            providerRefundId: refundId,
            providerPaymentId: asString(object.payment_intent) ?? asString(object.charge),
            status: asString(object.status) ?? "pending",
            amountMinor: asNumber(object.amount),
          });
        }
        break;
      }
      default:
        break;
    }

    await finishWebhookEvent(claimed.id);
  } catch (error) {
    await finishWebhookEvent(claimed.id, error instanceof Error ? error.message : "Unknown Stripe webhook processing error");
    throw error;
  }
}

export async function processRazorpayWebhook(input: {
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const claimed = await claimWebhookEvent({
    provider: "razorpay",
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    payload: input.payload,
  });
  if (!claimed.process) return;

  try {
    const payload = asRecord(input.payload.payload);
    const payment = asRecord(asRecord(payload.payment).entity);
    const order = asRecord(asRecord(payload.order).entity);
    const subscription = asRecord(asRecord(payload.subscription).entity);
    const invoice = asRecord(asRecord(payload.invoice).entity);
    const refund = asRecord(asRecord(payload.refund).entity);

    if (input.eventType === "payment.captured") {
      const orderId = asString(payment.order_id);
      const paymentId = asString(payment.id);
      if (orderId && paymentId) {
        await settleProviderPayment({
          provider: "razorpay",
          providerCheckoutId: orderId,
          providerPaymentId: paymentId,
          amountMinor: asNumber(payment.amount),
          currency: asString(payment.currency) ?? "INR",
        });
      }
    }

    if (
      input.eventType === "subscription.activated" ||
      input.eventType === "subscription.charged" ||
      input.eventType === "subscription.cancelled" ||
      input.eventType === "subscription.halted"
    ) {
      const subscriptionId = asString(subscription.id);
      const notes = asRecord(subscription.notes);
      if (subscriptionId) {
        await syncProviderSubscription({
          provider: "razorpay",
          providerSubscriptionId: subscriptionId,
          checkoutId: asString(notes.checkoutId),
          status: asString(subscription.status) ?? (input.eventType === "subscription.cancelled" ? "canceled" : "active"),
          currentPeriodEndsAt: unixDate(subscription.current_end),
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_cycle_end),
          metadata: notes,
        });
      }
    }

    if (input.eventType === "invoice.paid" || input.eventType === "invoice.payment_failed") {
      const subscriptionId = asString(invoice.subscription_id);
      const invoiceId = asString(invoice.id);
      if (invoiceId) {
        await syncProviderInvoice({
          provider: "razorpay",
          providerInvoiceId: invoiceId,
          providerSubscriptionId: subscriptionId,
          status: asString(invoice.status) ?? (input.eventType === "invoice.paid" ? "paid" : "open"),
          amountPaidMinor: asNumber(invoice.amount_paid),
          amountDueMinor: asNumber(invoice.amount_due),
          currency: asString(invoice.currency) ?? "INR",
          hostedInvoiceUrl: asString(invoice.short_url),
          dueAt: unixDate(invoice.expire_by),
          paidAt: input.eventType === "invoice.paid" ? new Date() : null,
        });
      }
    }

    if (input.eventType === "refund.created" || input.eventType === "refund.processed" || input.eventType === "refund.failed") {
      const refundId = asString(refund.id);
      if (refundId) {
        await syncProviderRefund({
          provider: "razorpay",
          providerRefundId: refundId,
          providerPaymentId: asString(refund.payment_id),
          status: asString(refund.status) ?? "pending",
          amountMinor: asNumber(refund.amount),
        });
      }
    }

    await finishWebhookEvent(claimed.id);
  } catch (error) {
    await finishWebhookEvent(claimed.id, error instanceof Error ? error.message : "Unknown Razorpay webhook processing error");
    throw error;
  }
}
