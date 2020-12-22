import {detect} from 'chardet';
import iconv from 'iconv-lite';

const stylesheetPathPattern = new RegExp(/<link.*href=(?:"|')(.*\.css)(?:"|')[^>]*>/,'i');
// const cssImportPattern = new RegExp(/(?:@import )(?:url\()*(?:'|")(.*)(?:"|'|")(?:\))*/g);
// const charsetPattern = new RegExp(/<meta.+(?:charset="(.+)"|content="(?:.*)charset=([^"|;]+)).+>/,'gi');
const charsetRegExp = new RegExp(/<meta.+(?:charset="(.+)"|content="(?:.*)charset=([^"|;]+)).+>/, 'im');
const bomRegExp = new RegExp(/^\uFEFF/);

const xmlDeclarationRegExp = new RegExp(/<\?xml version=".+"\sencoding="(.+)"\?>/, 'im');


enum Doctype {
  HTML_5,
  HTML_4_01_Strict,
  HTML_4_01_Transitional,
  HTML_4_01_Frameset,
  HTML_3_2,
  HTML_2_0,
  XHTML_1_0_Strict,
  XHTML_1_0_Transitional,
  XHTML_1_0_Frameset,
  XHTML_1_1,
  XHTML_Basic_1_1,
  XHTML_Basic_1_0
}

namespace Doctype {
  const doctypeRegExp = new RegExp(/<!doctype\s+html(?:\sPUBLIC\s*\"([^">]*)\"*\s*\"*([^">]*)\")*>/, 'ims');

  const publicIdentifierToDocType = new Map([
    ["-//W3C//DTD HTML 4.01//EN", Doctype.HTML_4_01_Strict],
    ["-//W3C//DTD HTML 4.01 Transitional//EN", Doctype.HTML_4_01_Transitional],
    ["-//W3C//DTD HTML 4.01 Frameset//EN", Doctype.HTML_4_01_Frameset],
    ["-//W3C//DTD HTML 3.2 Final//EN", Doctype.HTML_3_2],
    ["-//IETF//DTD HTML 2.0//EN", Doctype.HTML_2_0],
    ["-//W3C//DTD XHTML 1.0 Strict//EN", Doctype.XHTML_1_0_Strict],
    ["-//W3C//DTD XHTML 1.0 Transitional//EN", Doctype.XHTML_1_0_Transitional],
    ["-//W3C//DTD XHTML 1.0 Frameset//EN", Doctype.XHTML_1_0_Frameset],
    ["-//W3C//DTD XHTML 1.1//EN", Doctype.XHTML_1_1],
    ["-//W3C//DTD XHTML Basic 1.1//EN", Doctype.XHTML_Basic_1_1],
    ["-//W3C//DTD XHTML Basic 1.0//EN", Doctype.XHTML_Basic_1_0],
  ]);

  const systemIdentifierToDocType = new Map([
    ["http://www.w3.org/TR/html4/strict.dtd", Doctype.HTML_4_01_Strict],
    ["http://www.w3.org/TR/html4/loose.dtd", Doctype.HTML_4_01_Transitional],
    ["http://www.w3.org/TR/html4/frameset.dtd", Doctype.HTML_4_01_Frameset],
    ["http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd", Doctype.XHTML_1_0_Strict],
    ["http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd", Doctype.XHTML_1_0_Transitional],
    ["http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd", Doctype.XHTML_1_0_Frameset],
    ["http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd", Doctype.XHTML_1_1],
    ["http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd", Doctype.XHTML_Basic_1_1],
    ["http://www.w3.org/TR/xhtml-basic/xhtml-basic10.dtd", Doctype.XHTML_Basic_1_0],
  ]);

  export function defaultEncoding(doctype: Doctype): "utf8" | "latin1" | "ascii" {
    switch (doctype) {
      case Doctype.HTML_5:
      case Doctype.XHTML_1_0_Strict:
      case Doctype.XHTML_1_0_Transitional:
      case Doctype.XHTML_1_0_Frameset:
      case Doctype.XHTML_1_1:
      case Doctype.XHTML_Basic_1_1:
      case Doctype.XHTML_Basic_1_0: return 'utf8';
      case Doctype.HTML_4_01_Strict:
      case Doctype.HTML_4_01_Transitional:
      case Doctype.HTML_4_01_Frameset:
      case Doctype.HTML_3_2:
      case Doctype.HTML_2_0: return 'latin1';
    }
  }

  export function fromPublicIdentifier(str: string): Doctype | undefined {
    return publicIdentifierToDocType.get(str);
  }

  export function fromSystemIdentifier(str: string): Doctype | undefined {
    return systemIdentifierToDocType.get(str);
  }

  export function parse(str: string): Doctype | undefined {
    const result = doctypeRegExp.exec(str);

    if (result == null) return undefined;

    const publicIdentifier = result[1];
    const systemIdentifier = result[2];
    if (publicIdentifier === undefined && systemIdentifier === undefined) return Doctype.HTML_5;

    const publicIdentifierDoctype = Doctype.fromPublicIdentifier(publicIdentifier);
    const systemIdentifierDoctype = Doctype.fromSystemIdentifier(systemIdentifier);
    if (publicIdentifierDoctype === Doctype.HTML_3_2 || publicIdentifierDoctype === Doctype.HTML_2_0) {
      return publicIdentifierDoctype;
    }

    if (publicIdentifierDoctype != null && systemIdentifierDoctype != null) {
      return publicIdentifierDoctype === systemIdentifierDoctype ? publicIdentifierDoctype : undefined;
    }

    return publicIdentifierDoctype || systemIdentifierDoctype;
  }
}

export default function(buffer:Buffer): string | null {
  const chunk = buffer.toString('ascii', 0, 1024);

  // meta tag
  const charset = charsetRegExp.exec(chunk);
  if (charset != null) {
    const match = (charset[1] || charset[2]).toLowerCase();
    if (iconv.encodingExists(match)) return match;
  }

  // xml declaration
  const xmlDeclaration = xmlDeclarationRegExp.exec(chunk);
  if (xmlDeclaration != null) {
    const xmlDeclarationEncoding = xmlDeclaration[1].toLowerCase();
    if (iconv.encodingExists(xmlDeclarationEncoding)) return xmlDeclarationEncoding;
  }

  // byte order mark first three bytes
  if (bomRegExp.test(chunk)) return 'utf8';

  // doctype defaults
  const doctype = Doctype.parse(chunk);
  if (doctype != null) return Doctype.defaultEncoding(doctype);

  const encodingDetectionGuess = detect(buffer);
  if (encodingDetectionGuess != null) {
    if (iconv.encodingExists(encodingDetectionGuess)) {
      return encodingDetectionGuess;
    }
  }

  return null;
}
