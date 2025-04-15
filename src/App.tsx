import React, { useState, useEffect } from 'react'
import { Globe, Copy } from 'lucide-react'
import { CopyToClipboard } from 'react-copy-to-clipboard'

function App() {
  const [targetUrl, setTargetUrl] = useState('')
  const [outputUrl, setOutputUrl] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const [isWebflowCopied, setIsWebflowCopied] = useState(false)
  const [urlError, setUrlError] = useState('')

  const webflowFormDisablerCode = `<!-- Webflow Form Disabler -->
<script>
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form").forEach((oldForm) => {
      const newDiv = document.createElement("div");
      for (let attr of oldForm.attributes) {
        if (attr.name !== "action" && attr.name !== "method") {
          newDiv.setAttribute(attr.name, attr.value);
        }
      }
      newDiv.innerHTML = oldForm.innerHTML;
      newDiv.classList.add("hijacked-form");
      oldForm.replaceWith(newDiv);
    });

    document.querySelectorAll(".hijacked-form").forEach((form) => {
      const startTime = Date.now();
      const submitButton = form.querySelector("button, input[type='button'], input[type='submit']");
      if (!submitButton) return;

      function clearTooltips() {
        form.querySelectorAll(".w-form-fail-tooltip").forEach((el) => el.remove());
        form.querySelectorAll(".field-error").forEach((el) => el.classList.remove("field-error"));
      }

      submitButton.addEventListener("click", async function (e) {
        e.preventDefault();
        clearTooltips();

        const honeypot = form.querySelector("[name='website']");
        if (honeypot && honeypot.value.trim() !== "") return;

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed < 3) return;

        const webhook = form.getAttribute("webhook") || form.getAttribute("data-webhook");
        if (!webhook) return;

        const wrapper = form.closest(".w-form");
        const successEl = wrapper?.querySelector(".w-form-done");
        const errorEl = wrapper?.querySelector(".w-form-fail");
        if (successEl) successEl.style.display = "none";
        if (errorEl) errorEl.style.display = "none";

        let hasError = false;
        form.querySelectorAll("[required]").forEach((el) => {
          const isEmpty =
            (el.type === "checkbox" && !el.checked) ||
            (el.type === "file" && el.files.length === 0) ||
            (!["checkbox", "file"].includes(el.type) && el.value.trim() === "");

          if (isEmpty) {
            hasError = true;
            el.classList.add("field-error");

            const tooltip = document.createElement("div");
            tooltip.className = "w-form-fail-tooltip";
            tooltip.innerText = "Please fill out this field.";
            tooltip.style.position = "absolute";
            tooltip.style.background = "#f44336";
            tooltip.style.color = "#fff";
            tooltip.style.fontSize = "12px";
            tooltip.style.padding = "6px 10px";
            tooltip.style.borderRadius = "3px";
            tooltip.style.marginTop = "4px";
            tooltip.style.zIndex = "1000";
            tooltip.style.whiteSpace = "nowrap";

            const rect = el.getBoundingClientRect();
            tooltip.style.top = \`\${rect.bottom + window.scrollY + 4}px\`;
            tooltip.style.left = \`\${rect.left + window.scrollX}px\`;

            form.appendChild(tooltip);
          }
        });

        if (hasError) return;

        const formData = new FormData();
        form.querySelectorAll("input, textarea, select").forEach((el) => {
          if (!el.name) return;
          if (el.type === "file" && el.files.length > 0) {
            formData.append(el.name, el.files[0]);
          } else if (el.type !== "button" && el.type !== "submit") {
            formData.append(el.name, el.value);
          }
        });

        try {
          const res = await fetch(webhook, {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            form.style.display = "none";
            if (successEl) successEl.style.display = "block";
          } else {
            throw new Error("Non-200 response");
          }
        } catch (err) {
          console.error("Submission error:", err);
          if (errorEl) errorEl.style.display = "block";
        }
      });

      form.querySelectorAll("input, textarea, select").forEach((el) => {
        el.addEventListener("input", () => clearTooltips());
      });
    });
  });
</script>`;

  const validateAndEnforceHttps = (url: string) => {
    let finalUrl = url;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    try {
      new URL(finalUrl);
      setUrlError('');
      return finalUrl;
    } catch {
      setUrlError('Please enter a valid URL');
      return '';
    }
  };

  const handleTargetUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const validated = validateAndEnforceHttps(e.target.value);
    setTargetUrl(validated);
  };

  const handleOutputUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const validated = validateAndEnforceHttps(e.target.value);
    setOutputUrl(validated);
  };

  useEffect(() => {
    if (!targetUrl || !outputUrl || urlError) {
      setGeneratedCode('');
      return;
    }

    const codeSnippet = `export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname === '/' ? '' : url.pathname;

      const canonicalDomain = '${outputUrl}';

      if (url.hostname.includes('webflow.io')) {
        return Response.redirect(\`\${canonicalDomain}\${path}\`, 301);
      }

      if (path === '/robots.txt') {
        return new Response(\`User-agent: *\\nAllow: /\`, {
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      const targetUrl = \`${targetUrl}\${path}\`;
      const response = await fetch(targetUrl, {
        headers: request.headers
      });

      let content = await response.text();

      const injected = \`
        <link rel="canonical" href="\${canonicalDomain}\${path}">
        <style>
          #__framer-badge-container,
          [class^="w-webflow-badge"] {
            display: none !important;
          }
        </style>
      \`;
      content = content.replace('</head>', injected + '</head>');

      return new Response(content, {
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=300"
        }
      });
    } catch (e) {
      return new Response('An error occurred: ' + e.message, { status: 500 });
    }
  }
};`;

    setGeneratedCode(codeSnippet);
  }, [targetUrl, outputUrl, urlError]);

  const onCopy = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const onWebflowCopy = () => {
    setIsWebflowCopied(true);
    setTimeout(() => setIsWebflowCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex flex-col items-center justify-center p-8">
      <div className="bg-white p-10 rounded-xl shadow-xl w-full max-w-lg space-y-6">
        <div className="text-center">
          <Globe className="mx-auto h-12 w-12 text-blue-500" />
          <h2 className="mt-2 text-3xl font-bold text-gray-800">Enter URLs</h2>
          <p className="mt-1 text-gray-500">Type in your target and output URLs below.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="targetUrl" className="block text-gray-700 text-sm font-bold mb-2">
              Target URL:
            </label>
            <input
              type="url"
              id="targetUrl"
              className={`w-full px-4 py-3 rounded-md border ${urlError ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
              placeholder="target.com"
              value={targetUrl}
              onChange={handleTargetUrlChange}
            />
          </div>
          <div>
            <label htmlFor="outputUrl" className="block text-gray-700 text-sm font-bold mb-2">
              Output URL:
            </label>
            <input
              type="url"
              id="outputUrl"
              className={`w-full px-4 py-3 rounded-md border ${urlError ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-blue-500 focus:outline-none`}
              placeholder="output.com"
              value={outputUrl}
              onChange={handleOutputUrlChange}
            />
          </div>
          {urlError && <p className="text-red-500 text-sm italic">{urlError}</p>}
        </div>

        {(targetUrl && outputUrl && !urlError) && (
          <>
            <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200 space-y-2 relative">
              <CopyToClipboard text={generatedCode} onCopy={onCopy}>
                <button className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm flex items-center">
                  <Copy className="h-4 w-4 mr-2" />
                  {isCopied ? 'Copied!' : 'Copy Code'}
                </button>
              </CopyToClipboard>
              <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto max-h-48">
                <code>{generatedCode}</code>
              </pre>
            </div>

            <div className="mt-4 flex space-x-4">
              <CopyToClipboard text={generatedCode} onCopy={onCopy}>
                <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm flex items-center">
                  <Copy className="h-4 w-4 mr-2" />
                  {isCopied ? 'Copied!' : 'Copy Code'}
                </button>
              </CopyToClipboard>
              <CopyToClipboard text={webflowFormDisablerCode} onCopy={onWebflowCopy}>
                <button className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm flex items-center">
                  <Copy className="h-4 w-4 mr-2" />
                  {isWebflowCopied ? 'Copied!' : 'Disable Webflow Forms'}
                </button>
              </CopyToClipboard>
            </div>
            <p className="text-gray-500 text-sm mt-2">
              Paste this code before the <code>{'</body>'}</code> tag.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default App
