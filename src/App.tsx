import * as pdfjs from "pdfjs-dist";
import { createSignal, For, Show } from "solid-js";
import { createPDFContext, PDFContext, useCtx } from "./context";
import { PdfPage } from "./PdfPage";


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
      <a
        target="_blank"
        href="https://github.com/nathanoy/makePdfsLernable/blob/main/Guide.md"
        class="fancy-button"
      >
        Help
      </a>
    </div>
  );
}

function Main() {
  const ctx = useCtx();
  return (
    <>
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
