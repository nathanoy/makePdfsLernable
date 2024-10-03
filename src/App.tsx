import {
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
  useContext,
  createContext,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type DrainFunc = () => Promise<[RectLocation, Blob][]>;

function createPDFContext() {
  const [src, setSrc] = createSignal<string>();
  const [pdfBytes, setPdfBytes] = createSignal<ArrayBuffer>();
  const [loadedPdf, setLoadedPdf] = createSignal<pdfjs.PDFDocumentProxy>();

  createEffect(async () => {
    const local_src = src();
    if (!local_src) {
      setPdfBytes(undefined);
      return;
    }
    const response = await fetch(local_src);
    const bytes = await response.arrayBuffer();
    setPdfBytes(bytes);
  });

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
      registeredPages = []
    }
  })

  let registeredPages: {
    pageNum: number;
    canvas: HTMLCanvasElement;
    drainRectsWithImg: DrainFunc;
  }[] = [];

  return {
    src,
    setSrc,
    loadedPdf,
    setLoadedPdf,
    pdfBytes,
    setPdfBytes,

    registerPage(
      pageNum: number,
      canvas: HTMLCanvasElement,
      drainRectsWithImg: DrainFunc,
    ) {
      registeredPages.push({ pageNum, canvas, drainRectsWithImg });
    },

    async render() {
      const local_bytes = pdfBytes();
      if (!local_bytes) return;
      const pdfDoc = await PDFDocument.load(local_bytes);
      const HelveticaBoldFont = await pdfDoc.embedFont(
        StandardFonts.HelveticaBold,
      );
      const pages = pdfDoc.getPages();

      const imgs: { imgBlob: Blob; rect: RectLocation; label: string }[] = [];

      for (const { pageNum, drainRectsWithImg } of registeredPages) {
        console.log(pageNum)
        const page = pages[pageNum - 1]; // Page number to page index
        const bb = page.getMediaBox();
        const rects = await drainRectsWithImg();
        for (const [i, [rect, imgBlob]] of rects.entries()) {
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
          const text = rects.length > 1 ? `${pageNum}.${i + 1}` : `${pageNum}`;
          const textWidth = HelveticaBoldFont.widthOfTextAtSize(text, fontSize);
          const textHeight = HelveticaBoldFont.heightAtSize(fontSize);

          page.drawText(text, {
            x: x + (w - textWidth) / 2,
            y: y - (h + textHeight) / 2,
            color: rgb(0.9, 0.9, 0.9),
            font: HelveticaBoldFont,
            size: fontSize,
          });

          imgs.push({
            imgBlob,
            rect,
            label: text,
          });
        }
      }
      await addImagesToPDF(pdfDoc, HelveticaBoldFont, imgs);
      const bytes = await pdfDoc.save();
      setSrc((old) => {
        if (old) URL.revokeObjectURL(old); // when its invalid nothing happens
        return URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        );
      });
    },
  } as const;
}
type CTXType = ReturnType<typeof createPDFContext>;
const PDFContext = createContext<CTXType>();

function useCtx() {
  const ctx = useContext(PDFContext);
  if (!ctx)
    throw new Error(
      `${useCtx.name}() should not be called without a provider.`,
    );
  return ctx;
}

async function addImagesToPDF(
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

    if ((width - (margin + xOffset + gap) > imageWidth) && (prevYOffset > gap * 3 / 2 + fontSize + imageHeight) ) {
      yLineMin = Math.min(yLineMin, yOffset);
      yOffset = prevYOffset;
      xOffset += gap;
    } else {
      // new line
      yOffset = prevYOffset = yLineMin;
      xOffset = margin;
    }

    if (yOffset < gap * 3 / 2 + fontSize + imageHeight) {
      yOffset = prevYOffset = yLineMin = height - margin;
      xOffset = margin
      page = pdf.addPage();
    }
    console.log({yOffset})
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

type RectLocation = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function RectAnnotationToLocation(a: RectAnnotation) {
  const { x1, x2, y1, y2 } = fixAnnotation(a);
  return {
    x: x1,
    y: 1 - y1,
    w: Math.abs(x1 - x2),
    h: Math.abs(y1 - y2),
  };
}

type RectAnnotation = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const clamp = (min: number, num: number, max: number) =>
  Math.max(min, Math.min(num, max));
const clamp01 = (num: number) => clamp(0, num, 1);

function fixAnnotation(a: RectAnnotation) {
  return {
    x1: clamp01(Math.min(a.x1, a.x2)),
    y1: clamp01(Math.min(a.y1, a.y2)),
    x2: clamp01(Math.max(a.x1, a.x2)),
    y2: clamp01(Math.max(a.y1, a.y2)),
  };
}

function getCanvasAsBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(function (blob) {
      if (!blob) {
        throw new Error("Expected blob to be non null");
      }
      resolve(blob);
    }, "img/jpg");
  });
}

async function getCanvasPartAsImage(
  canvas: HTMLCanvasElement,
  a: RectAnnotation,
) {
  const { x1, x2, y1, y2 } = fixAnnotation(a);
  const width = canvas.width * Math.abs(x1 - x2);
  const height = canvas.height * Math.abs(y1 - y2);

  const croppedCanvas = document.createElement("canvas");
  const croppedContext = croppedCanvas.getContext("2d")!;
  croppedCanvas.width = width;
  croppedCanvas.height = height;

  croppedContext.drawImage(
    canvas,
    x1 * canvas.width,
    y1 * canvas.height,
    width,
    height,
    0,
    0,
    width,
    height,
  );
  const img = await getCanvasAsBlob(croppedCanvas);
  croppedCanvas.remove();
  return img;
}

const percent = (x: number) => `${x * 100}%`;

function PdfPage(props: { pdf: pdfjs.PDFDocumentProxy; pageNum: number }) {
  const ctx = useCtx();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>();
  const [rects, setRects] = createStore<RectAnnotation[]>([]);

  onMount(() => {
    const local_canvas = canvas();
    if (!local_canvas) throw new Error("Expected ref in onmount");
    ctx.registerPage(props.pageNum, local_canvas, async () => {
      const ret = await Promise.all(
        rects.map(async (rect) => {
          const r = RectAnnotationToLocation(rect) as RectLocation & {
            page: number;
          };
          r.page = props.pageNum;
          const img = await getCanvasPartAsImage(canvas()!, rect);
          return [r, img] as Awaited<ReturnType<DrainFunc>>[number];
        }),
      );
      setRects([]);
      return ret;
    });
  });

  createEffect(async () => {
    const local_canvas = canvas();
    if (!local_canvas) return;

    const page = await props.pdf.getPage(props.pageNum);
    const scale = 3.0;
    const viewport = page.getViewport({ scale });
    const context = local_canvas.getContext("2d")!; // as we put in the literal "2d" it cant be null: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext

    local_canvas.height = viewport.height;
    local_canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
  });

  const [currentRect, setCurrentRect] = createSignal<RectAnnotation>();

  return (
    <div class="p-2">
      <div class="relative">
        <div>
          <For each={rects}>
            {(rect, i) => (
              <div
                class="pointer-events-none absolute outline outline-1 outline-red-900"
                style={{
                  left: percent(rect.x1),
                  top: percent(rect.y1),
                  right: percent(1 - rect.x2),
                  bottom: percent(1 - rect.y2),
                }}
              ></div>
            )}
          </For>
          <Show when={currentRect()}>
            {(rect) => {
              const local_rect = () => fixAnnotation(rect());
              return (
                <div
                  class="pointer-events-none absolute outline-dashed outline-2 outline-blue-900"
                  style={{
                    left: percent(local_rect().x1),
                    top: percent(local_rect().y1),
                    right: percent(1 - local_rect().x2),
                    bottom: percent(1 - local_rect().y2),
                  }}
                ></div>
              );
            }}
          </Show>
        </div>
        <canvas
          onmousedown={(e) => {
            const bb = e.target.getBoundingClientRect();
            setCurrentRect({
              x1: e.offsetX / bb.width,
              y1: e.offsetY / bb.height,
              x2: e.offsetX / bb.width,
              y2: e.offsetY / bb.height,
            });
          }}
          onmousemove={(e) => {
            const local_currentRect = currentRect();
            if (!local_currentRect) {
              return;
            }
            const bb = e.target.getBoundingClientRect();
            if (e.ctrlKey) {
              setCurrentRect((rect) => {
                const width = local_currentRect.x2 - local_currentRect.x1;
                const height = local_currentRect.y2 - local_currentRect.y1;
                const x2 = e.offsetX / bb.width;
                const y2 = e.offsetY / bb.height;
                return {
                  x1: x2 - width,
                  y1: y2 - height,
                  x2,
                  y2,
                };
              });
            } else {
              setCurrentRect({
                x1: local_currentRect.x1,
                y1: local_currentRect.y1,
                x2: e.offsetX / bb.width,
                y2: e.offsetY / bb.height,
              });
            }
          }}
          onmouseup={(e) => {
            const local_currentRect = currentRect();
            if (!local_currentRect) {
              return;
            }
            const bb = e.target.getBoundingClientRect();
            const square = (x: number) => x * x;
            if (
              Math.sqrt(
                square(local_currentRect.x1 - local_currentRect.x2) +
                  square(local_currentRect.y1 - local_currentRect.y2),
              ) > 0.005 // 0.5% min size
            ) {
              // This syntax appends
              setRects(rects.length, fixAnnotation(local_currentRect));
            }
            setCurrentRect(undefined);
          }}
          oncontextmenu={(e) => {
            e.preventDefault();
            setRects([]);
          }}
          ref={setCanvas}
          class="w-full cursor-crosshair shadow-[0_0_5px_#bababa] ring-offset-0"
        ></canvas>
      </div>
    </div>
  );
}

function TopBar() {
  const ctx = useCtx();
  const [input, setInput] = createSignal<HTMLInputElement>();
  return (
    <div class="sticky top-0 z-10 flex w-full place-content-center gap-4 p-4 backdrop-blur">
      <Show when={ctx.src()}>
        {(href) => (
          <a href={href()} target="_blank" class="fancy-button">
            Open
          </a>
        )}
      </Show>

      <Show
        when={ctx.loadedPdf()}
        fallback={
          <button class="fancy-button" onclick={() => input()?.click()}>
            <input
              ref={setInput}
              onchange={(e) => {
                if (!e.target.files) return;
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.readAsArrayBuffer(file);
                reader.onload = () => {
                  const result = reader.result! as ArrayBuffer;
                  ctx.setPdfBytes(result);
                };
              }}
              accept=".pdf"
              type="file"
              class="hidden"
            ></input>
            Load
          </button>
        }
      >
        {" "}
        <button onclick={ctx.render} class="fancy-button">
          Render
        </button>
        <button
          onclick={() => {
            ctx.setPdfBytes(undefined);
          }}
          class="fancy-button"
        >
          Unload
        </button>
      </Show>
    </div>
  );
}

function Main() {
  const ctx = useCtx();
  return (
    <>
      <TopBar />
      <div class="m-auto max-w-screen-md">
        <Show when={ctx.loadedPdf()}>
          {(pdf) => (
            <For
              each={Array.from(Array(pdf().numPages).keys()).map((x) => x + 1)}
            >
              {(i) => <PdfPage pdf={pdf()} pageNum={i} />}
            </For>
          )}
        </Show>
      </div>
    </>
  );
}

function App() {
  return (
    <PDFContext.Provider value={createPDFContext()}>
      <Main />
    </PDFContext.Provider>
  );
}

export default App;
