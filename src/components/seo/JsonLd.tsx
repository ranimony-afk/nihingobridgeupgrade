import { serializeJsonLd, type JsonLd as JsonLdData } from "@/lib/seo/jsonld";

/** Injects Schema.org structured data. Values are escaped in serializeJsonLd. */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
