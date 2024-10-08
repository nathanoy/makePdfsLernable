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
  watermark = false,
) {
  if (imgs.length === 0) return;

  let page = pdf.addPage();

  const { width, height } = page.getSize();
  const margin = 20;
  const fontSize = 16;
  const gap = 15;

  let yOffset = height - margin;
  let yLineMin = yOffset;
  let prevYOffset = yOffset;
  let xOffset = width; // so the first image hits the "new line" code block
  const watermarkfn = () => {
    if (!watermark) return;
    const url = "https://nathanoy.github.io/makePdfsLernable";
    const txt = `Created with ${url}`;
    const textWidth = font.widthOfTextAtSize(txt, 6);
    const textHeight = font.heightAtSize(fontSize);

    page.drawText(txt, {
      x: (width - textWidth) / 2,
      y: 5,
      size: 6,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
  };
  watermarkfn();

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
      prevYOffset > gap * 2 + fontSize + imageHeight
    ) {
      yOffset = prevYOffset;
      xOffset += gap;
    } else {
      // new line
      yOffset = prevYOffset = yLineMin;
      xOffset = margin;
    }

    if (yOffset < gap * 2 + fontSize + imageHeight) {
      // new page
      yOffset = prevYOffset = yLineMin = height - margin;
      xOffset = margin;
      page = pdf.addPage();
      watermarkfn();
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
    xOffset += imageWidth;
  }
}

export function paintRect(
  page: PDFPage,
  rect: RectLocation,
  text: string,
  font: PDFFont,
) {
  const bb = page.getMediaBox();
  const x = rect.x * bb.width;
  const y = rect.y * bb.height;
  const h = rect.h * bb.height;
  const w = rect.w * bb.width;
  const fontSize = Math.min(
    Math.round(h * 0.8),
    0.04 * bb.height,
    0.04 * bb.width,
  );
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
