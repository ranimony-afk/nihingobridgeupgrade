import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import sax from "sax";

export type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  text: string;
  children: XmlNode[];
};

export function childNodes(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => child.name === name);
}

export function firstChildText(node: XmlNode, name: string): string | null {
  return childNodes(node, name)[0]?.text.trim() || null;
}

export function childTexts(node: XmlNode, name: string): string[] {
  return childNodes(node, name)
    .map((child) => child.text.trim())
    .filter(Boolean);
}

function inputStream(filePath: string): Readable {
  const source = createReadStream(filePath);
  return filePath.endsWith(".gz") ? source.pipe(createGunzip()) : source;
}

/**
 * Streams XML and emits each immediate matching element as a compact tree.
 * e.g. `entry` for JMdict/JMnedict and `character` for KANJIDIC2.
 */
export async function streamXmlElements(
  filePath: string,
  elementName: string,
  onElement: (element: XmlNode, ordinal: number) => Promise<void> | void,
): Promise<void> {
  const parser = sax.parser(true, { trim: false, normalize: false, lowercase: false });
  const stack: XmlNode[] = [];
  let ordinal = 0;
  let pending = Promise.resolve();

  parser.onopentag = (tag) => {
    stack.push({
      name: tag.name,
      attributes: Object.fromEntries(Object.entries(tag.attributes).map(([key, value]) => [key, String(value)])),
      text: "",
      children: [],
    });
  };

  parser.ontext = (text) => {
    const current = stack.at(-1);
    if (current) current.text += text;
  };

  parser.oncdata = (text) => {
    const current = stack.at(-1);
    if (current) current.text += text;
  };

  parser.onclosetag = () => {
    const node = stack.pop();
    if (!node) return;
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);

    if (node.name === elementName) {
      ordinal += 1;
      pending = pending.then(() => onElement(node, ordinal));
    }
  };

  parser.onerror = (error) => {
    throw error;
  };

  for await (const chunk of inputStream(filePath)) {
    parser.write(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
  }
  parser.close();
  await pending;
}
