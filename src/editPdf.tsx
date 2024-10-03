import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

export type RectLocation = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export async function addImagesToPDF(
  pdf: PDFDocument,
  font: PDFFont,
  imgs: { imgBlob: Blob; rect: RectLocation; label: string }[],
) {
  let page = pdf.addPage();
  const { width, height } = page.getSize();
  const margin = 20;
  const fontSize = 16;
  const gap = 20;

  let yOffset = height - margin;
  let yLineMin = yOffset;
  let prevYOffset = yOffset;
  let xOffset = width; // so the first image hits the "new line" code block

  for (const { imgBlob, label, rect } of imgs) {
    const imgArrayBuffer = await imgBlob.arrayBuffer();
    const imgType = imgBlob.type;
    let image;
    if (imgType === "image/jpeg") {
      image = await pdf.embedJpg(imgArrayBuffer);
    } else if (imgType === "image/png") {
      image = await pdf.embedPng(imgArrayBuffer);
    } else {
      throw new Error("Unsupported image type: " + imgType);
    }

    const imgDims = image.scale(1);
    const imageWidth = Math.min(rect.w * width, width - 3 * margin);
    const imageHeight = (imgDims.height / imgDims.width) * imageWidth;

    yLineMin = Math.min(yLineMin, yOffset);
    if (
      width - (margin + xOffset + gap) > imageWidth &&
      prevYOffset > (gap * 3) / 2 + fontSize + imageHeight
    ) {
      yOffset = prevYOffset;
      xOffset += gap;
    } else {
      // new line
      yOffset = prevYOffset = yLineMin;
      xOffset = margin;
    }

    if (yOffset < (gap * 3) / 2 + fontSize + imageHeight) {
      yOffset = prevYOffset = yLineMin = height - margin;
      xOffset = margin;
      page = pdf.addPage();
    }
    yOffset -= fontSize + gap;
    page.drawText(label, {
      x: xOffset,
      y: yOffset,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
    yOffset -= imageHeight + gap / 2;
    page.drawImage(image, {
      x: xOffset,
      y: yOffset,
      width: imageWidth,
      height: imageHeight,
    });
    page.drawRectangle({
      x: xOffset,
      y: yOffset,
      width: imageWidth,
      height: imageHeight,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 1,
    });
    yOffset -= gap;
    xOffset += imageWidth;
  }
}

export function paintRect(page: PDFPage, rect: RectLocation, text: string, font: PDFFont) {
    const bb = page.getMediaBox();
    const x = rect.x * bb.width;
    const y = rect.y * bb.height;
    const h = rect.h * bb.height;
    const w = rect.w * bb.width;
    const fontSize = Math.min(Math.round(h * 0.8), 0.02 * bb.height);
    page.drawRectangle({
      x,
      y,
      width: w,
      height: -h,
      color: rgb(0.3, 0.3, 0.3),
    });
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    page.drawText(text, {
      x: x + (w - textWidth) / 2,
      y: y - (h + textHeight) / 2,
      color: rgb(0.9, 0.9, 0.9),
      font: font,
      size: fontSize,
    });
}