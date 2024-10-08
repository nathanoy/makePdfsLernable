import { createSignal, For, Show } from "solid-js";
import { createPDFContext, PDFContext, useCtx } from "./context";
import { PdfPage } from "./PdfPage";
import { Icon } from "solid-heroicons";
import {
  arrowPath,
  arrowTopRightOnSquare,
  arrowUpTray,
  informationCircle,
  rocketLaunch,
  trash,
} from "solid-heroicons/outline";

function TopBar() {
  const ctx = useCtx();
  const [input, setInput] = createSignal<HTMLInputElement>();
  const [working, setWorking] = createSignal(false);
  return (
    <div class="sticky top-0 z-10 flex w-full flex-wrap place-content-center gap-4 p-4 backdrop-blur shadow-xl">
      <Show when={ctx.lastUrl()}>
        {(href) => (
          <>
            <a href={href()} target="_blank" class="fancy-button">
              <Icon path={arrowTopRightOnSquare} class="h-5" />
              Open Again
            </a>
            {/* <a
              href={href()}
              target="_blank"
              download="download.pdf"
              class="fancy-button"
            >
              <Icon path={arrowDownTray} class="h-5"/>
              Download
            </a> */}
          </>
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
            <Icon path={arrowUpTray} class="h-5" />
            Load
          </button>
        }
      >
        <button
          onclick={async () => {
            setWorking(true);
            try {
              await ctx.render();
            } catch (e) {
              console.error(e);
            }
            setWorking(false);
          }}
          class="fancy-button"
        >
          <Show
            when={working()}
            fallback={<Icon path={rocketLaunch} class="h-5" />}
          >
            <Icon path={arrowPath} class="h-5 animate-spin" />
          </Show>
          Render
        </button>
        <button
          onclick={() => {
            ctx.setPdfBytes(undefined);
          }}
          class="fancy-button"
        >
          <Icon path={trash} class="h-5" />
          Unload
        </button>
        <label class="inline-flex fancy-button">
          <input
            type="checkbox"
            value=""
            class="peer sr-only"
            checked={ctx.watermark()}
            oninput={(e) => ctx.setWatermark(e.target.checked)}
          />
          <div class="peer relative h-5 w-9 rounded-full bg-red-500 after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 transition-shadow peer-focus:ring-white rtl:peer-checked:after:-translate-x-full"></div>
          <span class="ms-3 select-none font-semibold text-white">
            Watermark
          </span>
        </label>
      </Show>
      <a
        target="_blank"
        href="https://github.com/nathanoy/makePdfsLernable/blob/main/Guide.md"
        class="fancy-button"
      >
        <Icon path={informationCircle} class="h-5" />
        Help
      </a>
    </div>
  );
}

function Main() {
  const ctx = useCtx();
  return (
    <div class="bg-[#d2d2cf] min-h-screen">
      <TopBar />
      <div
        class="m-auto max-w-screen-md"
        classList={{ "pr-8": ctx.touchMode() }}
      >
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
    </div>
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
