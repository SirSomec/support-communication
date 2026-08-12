import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";
import { readSheet } from "read-excel-file/node";
import { createServer } from "vite";
import { parseAudienceXlsx } from "../src/features/marketing/audienceImportModel.js";

describe("marketing XLSX export", () => {
  it("creates a standard XLSX ZIP container without spreadsheet formulas", async () => {
    const server = await createServer({ logLevel: "error", server: { middlewareMode: true } });
    try {
      const module = await server.ssrLoadModule("/src/features/marketing/MarketingScreen.jsx");
      const blob = await module.createMarketingXlsx([{ recipient: "=HYPERLINK(\"https://unsafe.example\")", status: "delivered" }]);
      const archive = Buffer.from(await blob.arrayBuffer());
      assert.deepEqual([...archive.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
      assert.match(archive.toString("utf8"), /xl\/workbook\.xml/);
      assert.match(archive.toString("utf8"), /xl\/worksheets\/sheet1\.xml/);
      const sheet = readZipEntry(archive, "xl/worksheets/sheet1.xml");
      assert.match(sheet, /&apos;=HYPERLINK/);

      const audienceWorkbook = await module.createMarketingXlsx([{ phone: 79162818330 }]);
      const audienceRecords = await parseAudienceXlsx(Buffer.from(await audienceWorkbook.arrayBuffer()), readSheet);
      assert.deepEqual(audienceRecords, [{ phone: "79162818330" }]);
    } finally {
      await server.close();
    }
  });
});

function readZipEntry(archive, expectedName) {
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    if (name === expectedName) return inflateRawSync(archive.subarray(dataStart, dataStart + compressedSize)).toString("utf8");
    offset = dataStart + compressedSize;
  }
  throw new Error(`Missing ZIP entry: ${expectedName}`);
}
