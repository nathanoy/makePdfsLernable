import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { useCtx } from "./context";
import { RectLocation } from "./editPdf";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export type DrainFunc = () => Promise<[RectLocation, Blob][]>;

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
export function PdfPage(props: {
  pdf: pdfjs.PDFDocumentProxy;
  pageNum: number;
}) {
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
  type EventOffset = {
    offsetX: number;
    offsetY: number;
    target: HTMLCanvasElement;
  };

  const start = (e: EventOffset) => {
    const bb = e.target.getBoundingClientRect();
    setCurrentRect({
      x1: e.offsetX / bb.width,
      y1: e.offsetY / bb.height,
      x2: e.offsetX / bb.width,
      y2: e.offsetY / bb.height,
    });
  };
  const move = (e: EventOffset & { ctrlKey: boolean }) => {
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
  };
  const end = (e: EventOffset) => {
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
  };

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
          onmousedown={({ offsetX, offsetY, target }) =>
            start({ offsetX, offsetY, target: target as HTMLCanvasElement })
          }
          onmousemove={({ offsetX, offsetY, target, ctrlKey }) =>
            move({
              ctrlKey,
              offsetX,
              offsetY,
              target: target as HTMLCanvasElement,
            })
          }
          onmouseup={({ offsetX, offsetY, target }) =>
            end({ offsetX, offsetY, target: target as HTMLCanvasElement })
          }
          ontouchstart={(e) => {
            ctx.setTouchMode(true);
            if (currentRect()) return;
            const { x, y } = offsetCalc(e.currentTarget, e.changedTouches[0]);
            start({
              offsetX: x,
              offsetY: y,
              target: e.target as HTMLCanvasElement,
            });
          }}
          // @ts-ignore: idk man
          on:touchmove={{
            handleEvent: (
              e: TouchEvent & { currentTarget: HTMLCanvasElement },
            ) => {
              ctx.setTouchMode(true);
              e.preventDefault();
              const { x, y } = offsetCalc(e.currentTarget, e.touches[0]);
              move({
                offsetX: x,
                offsetY: y,
                target: e.target as HTMLCanvasElement,
                ctrlKey: e.touches.length > 1,
              });
            },
            passive: false,
          }}
          ontouchend={(e) => {
            if (e.touches.length !== 0) return;
            const { x, y } = offsetCalc(e.currentTarget, e.changedTouches[0]);
            end({
              offsetX: x,
              offsetY: y,
              target: e.currentTarget,
            });
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

function offsetCalc(target: HTMLElement, touch: Touch) {
  const bb = target.getBoundingClientRect();
  const x = touch.clientX - bb.x;
  const y = touch.clientY - bb.y;
  return { x, y };
}
