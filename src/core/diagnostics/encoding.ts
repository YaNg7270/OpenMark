import type { DecodedText } from '../fs/encoding';
import type { Diagnostic } from '../markdown/types';

/**
 * Diagnostics about how a file was encoded on disk.
 *
 * These are facts the parser cannot see: by the time a document reaches the parser its BOM has
 * been stripped and its line endings recorded, and an invalid byte sequence has already been
 * replaced. They are reported at the top of the file because that is where the reader has to
 * act, and they are `info` rather than warnings because a BOM or a CRLF file is not a mistake —
 * it is something the reader should know before wondering why a diff looks wrong or why a
 * tool refuses the file.
 *
 * `crlf` alone is deliberately **not** reported: it is the normal encoding for a Windows
 * document and flagging it would put a permanent entry in the panel of almost every file.
 */
export function encodingDiagnostics(decoded: Pick<DecodedText, 'bom' | 'mixedEol' | 'lossy'>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const atStart = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

  if (decoded.lossy) {
    diagnostics.push({
      code: 'invalid-utf8',
      severity: 'error',
      message: 'File is not valid UTF-8',
      detail:
        '文件包含无法按 UTF-8 解码的字节，已用替换字符显示。若保存，这些字节将被永久改写；建议先用其他工具转换编码。',
      range: atStart,
      source: 'encoding',
    });
  }

  if (decoded.mixedEol) {
    diagnostics.push({
      code: 'mixed-line-endings',
      severity: 'info',
      message: 'File mixes CRLF and LF line endings',
      detail: '同一文件内混用了不同的换行符，diff 与部分工具会因此显示整文件改动。保存时会统一为文件原有风格。',
      range: atStart,
      source: 'encoding',
    });
  }

  if (decoded.bom) {
    diagnostics.push({
      code: 'bom-detected',
      severity: 'info',
      message: 'File starts with a UTF-8 BOM',
      detail: '文件带 BOM。某些工具会在首行看到多余字符；保存时会原样保留，不会擅自移除。',
      range: atStart,
      source: 'encoding',
    });
  }

  return diagnostics;
}
