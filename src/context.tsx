import { last, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import {
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import { DrainFunc as ReadRectsWImgFunc } from "./PdfPage";
import { addImagesToPDF, paintRect, RectLocation } from "./editPdf";

export function createPDFContext() {
  const [touchMode, setTouchMode] = createSignal(false);
  const [working, setWorking] = createSignal(false);

  const [watermark, setWatermark] = createSignal(true);

  const [lastUrl, setLastUrl] = createSignal<string>();
  const [pdfBytes, setPdfBytes] = createSignal<ArrayBuffer>();
  const [loadedPdf, setLoadedPdf] = createSignal<pdfjs.PDFDocumentProxy>();

  // createEffect(async () => {
  //   const local_src = src();
  //   if (!local_src) {
  //     setPdfBytes(undefined);
  //     return;
  //   }
  //   const response = await fetch(local_src);
  //   const bytes = await response.arrayBuffer();
  //   setPdfBytes(bytes);
  // });

  createEffect(async () => {
    const bytes = pdfBytes();
    if (!bytes) {
      setLoadedPdf(undefined);
      return;
    }
    setLoadedPdf(await pdfjs.getDocument(structuredClone(bytes)).promise);
  });

  createEffect(() => {
    if (!loadedPdf()) {
      registeredPages = [];
    }
  });

  let registeredPages: {
    pageNum: number;
    canvas: HTMLCanvasElement;
    RectsWithImg: ReadRectsWImgFunc;
  }[] = [];

  return {
    touchMode,
    setTouchMode,

    watermark,
    setWatermark,

    working,
    setWorking,

    lastUrl,
    setLastUrl,

    loadedPdf,
    setLoadedPdf,

    pdfBytes,
    setPdfBytes,

    registerPage(
      pageNum: number,
      canvas: HTMLCanvasElement,
      RectsWithImg: ReadRectsWImgFunc,
    ) {
      registeredPages.push({ pageNum, canvas, RectsWithImg });
    },

    async render() {
      if (working()) return;
      setWorking(true);
      try {
        const local_bytes = pdfBytes();
        if (!local_bytes) return;
        const pdfDoc = await PDFDocument.load(local_bytes);
        const HelveticaBoldFont = await pdfDoc.embedFont(
          StandardFonts.HelveticaBold,
        );
        const pages = pdfDoc.getPages();

        const imgs: { imgBlob: Blob; rect: RectLocation; label: string }[] = [];

        for (const { pageNum, RectsWithImg } of registeredPages) {
          const page = pages[pageNum - 1]; // Page number to page index

          const rects = await RectsWithImg();
          for (const [i, [rect, imgBlob]] of rects.entries()) {
            const txt = rects.length > 1 ? `${pageNum}.${i + 1}` : `${pageNum}`;
            paintRect(page, rect, txt, HelveticaBoldFont);
            imgs.push({
              imgBlob,
              rect,
              label: txt,
            });
          }
        }
        await addImagesToPDF(pdfDoc, HelveticaBoldFont, imgs, watermark());
        const bytes = await pdfDoc.save();
        const url = URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        );
        setLastUrl(url);
        window.open(url, "_blank");
      } catch (e) {
        console.error(e);
      }
      setWorking(false);
    },
  } as const;
}
export type CTXType = ReturnType<typeof createPDFContext>;
export const PDFContext = createContext<CTXType>();

export function useCtx() {
  const ctx = useContext(PDFContext);
  if (!ctx)
    throw new Error(
      `${useCtx.name}() should not be called without a provider.`,
    );
  return ctx;
}
