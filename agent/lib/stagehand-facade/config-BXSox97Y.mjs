import { z } from "zod/v4";
import { StagehandClientCreateConfigSchema } from "@browserbasehq/stagehand";
//#region src/facade/contract.ts
/**
* This file intentionally carries the same contract twice:
*
* - The JSON-schema literals below are the WIRE contract — the exact bytes
*   advertised to MCP clients via tools/list. They are hand-written because
*   they cannot be generated from the zod schemas: the `const`-typed `op`
*   discriminators and the per-property guidance descriptions do not survive
*   zod-to-JSON-schema conversion, and `.refine()` emits nothing at all.
*   Their wording is pinned string-exact to the reference contract (models
*   are prompted against these descriptions) — see
*   tests/facade-contract.test.ts. One deliberate deviation is documented on
*   RUN_INPUT_SCHEMA below.
*
* - The zod schemas at the bottom are the RUNTIME validators: they parse
*   tools/call arguments into typed values and enforce what the wire schema
*   states (e.g. the code/actions exclusivity via `.refine`).
*
* If you change one half, change the other; the contract test exists to
* catch drift between them.
*/
const actionSchema = (op, extra = {}) => ({
	type: "object",
	properties: {
		op: {
			const: op,
			description: `Action operation. Use "op": "${op}"; never use a "kind" field.`
		},
		id: {
			type: "string",
			description: "Bracketed ID copied from the latest snapshot, as a string. Use \"id\"; never use \"ref\"."
		},
		...extra
	},
	required: [
		"op",
		"id",
		...Object.keys(extra).filter((key) => key !== "delay")
	],
	additionalProperties: false
});
const RUN_TOOL_DESCRIPTION = "Browse and automate websites in the persistent Stagehand browser. Navigate with JavaScript such as await page.goto(\"https://example.com\"); there is no separate navigate or start tool. Execute either a JavaScript workflow against the Stagehand Playwright facade or a batch of actions using IDs from the latest snapshot. Provide exactly one of code or actions. Each action must use \"op\" (never \"kind\") and \"id\" (never \"ref\"). Copy the bracketed snapshot ID as a string. Examples: {\"actions\":[{\"op\":\"click\",\"id\":\"1-42\"}]}, {\"actions\":[{\"op\":\"fill\",\"id\":\"2-14\",\"value\":\"Miami\"}]}, {\"actions\":[{\"op\":\"select\",\"id\":\"3-9\",\"values\":\"Lowest price\"}]}.";
const SNAPSHOT_TOOL_DESCRIPTION = "Capture the active page's Stagehand accessibility tree and hydrate its displayed IDs for subsequent run actions. Every call replaces the active page's ID map.";
const SCREENSHOT_TOOL_DESCRIPTION = "Capture a screenshot of the active page. For size-constrained MCP clients, prefer a viewport JPEG: {\"type\":\"jpeg\",\"quality\":40,\"fullPage\":false}.";
const RUN_INPUT_SCHEMA = {
	type: "object",
	properties: {
		code: {
			type: "string",
			minLength: 1
		},
		actions: {
			type: "array",
			description: "Snapshot actions with the exact fields \"op\" and \"id\". Do not use \"kind\" or \"ref\".",
			items: { oneOf: [
				actionSchema("click"),
				actionSchema("hover"),
				actionSchema("fill", { value: { type: "string" } }),
				actionSchema("type", {
					text: { type: "string" },
					delay: {
						type: "number",
						minimum: 0
					}
				}),
				actionSchema("press", { key: { type: "string" } }),
				actionSchema("select", { values: { oneOf: [{ type: "string" }, {
					type: "array",
					items: { type: "string" },
					minItems: 1
				}] } })
			] },
			minItems: 1
		}
	},
	additionalProperties: false
};
const SNAPSHOT_INPUT_SCHEMA = {
	type: "object",
	properties: { includeIframes: {
		type: "boolean",
		default: true
	} },
	additionalProperties: false
};
const SCREENSHOT_INPUT_SCHEMA = {
	type: "object",
	properties: {
		fullPage: { type: "boolean" },
		type: {
			type: "string",
			enum: ["png", "jpeg"]
		},
		quality: {
			type: "number",
			minimum: 0,
			maximum: 100
		}
	},
	additionalProperties: false
};
const FACADE_TOOLS = [
	{
		name: "run",
		description: RUN_TOOL_DESCRIPTION,
		inputSchema: RUN_INPUT_SCHEMA
	},
	{
		name: "snapshot",
		description: SNAPSHOT_TOOL_DESCRIPTION,
		inputSchema: SNAPSHOT_INPUT_SCHEMA
	},
	{
		name: "screenshot",
		description: SCREENSHOT_TOOL_DESCRIPTION,
		inputSchema: SCREENSHOT_INPUT_SCHEMA
	}
];
/**
* Canonical agent system prompt for the facade tool surface. Host examples
* (Eve, Vercel AI SDK, deepagents) should use this text rather than authoring
* their own so agent guidance stays identical across frameworks.
*/
const FACADE_AGENT_INSTRUCTIONS = `You control one persistent browser through exactly three tools:
- snapshot: inspect the active page and hydrate bracketed element IDs.
- run: provide either snapshot actions or JavaScript using the Playwright-shaped page API.
- screenshot: inspect the rendered page visually.

Use snapshot actions for simple interactions and run code for multi-step workflows. Pass run exactly one of code or actions; every action uses "op" and "id", never "kind" or "ref". Snapshot IDs are valid only for the latest snapshot of the active page; snapshot again after navigation or stale IDs. Do not launch another browser.`;
const NO_HYDRATED_SNAPSHOT_ERROR = "No hydrated snapshot exists for the active page; call snapshot first.";
const NAVIGATED_SNAPSHOT_ERROR = "The active page navigated after its snapshot; call snapshot again.";
const STALE_SNAPSHOT_ID_ERROR = "Snapshot ID \"${id}\" is stale or not actionable; call snapshot again.";
function staleSnapshotIdError(id) {
	return STALE_SNAPSHOT_ID_ERROR.replace("${id}", id);
}
const RefActionSchema = z.discriminatedUnion("op", [
	z.strictObject({
		op: z.literal("click"),
		id: z.string().min(1)
	}),
	z.strictObject({
		op: z.literal("hover"),
		id: z.string().min(1)
	}),
	z.strictObject({
		op: z.literal("fill"),
		id: z.string().min(1),
		value: z.string()
	}),
	z.strictObject({
		op: z.literal("type"),
		id: z.string().min(1),
		text: z.string(),
		delay: z.number().nonnegative().optional()
	}),
	z.strictObject({
		op: z.literal("press"),
		id: z.string().min(1),
		key: z.string().min(1)
	}),
	z.strictObject({
		op: z.literal("select"),
		id: z.string().min(1),
		values: z.union([z.string(), z.array(z.string()).min(1)])
	})
]);
const CodeModeRunInputSchema = z.strictObject({
	code: z.string().min(1).optional(),
	actions: z.array(RefActionSchema).min(1).optional()
}).refine((input) => input.code === void 0 !== (input.actions === void 0), { message: "run requires exactly one of code or actions" });
const SnapshotInputSchema = z.strictObject({ includeIframes: z.boolean().optional() });
const ScreenshotInputSchema = z.strictObject({
	fullPage: z.boolean().optional(),
	type: z.enum(["png", "jpeg"]).optional(),
	quality: z.number().min(0).max(100).optional()
});
//#endregion
//#region src/facade/runtime.ts
/**
* Builds a Playwright-shaped facade entirely inside a Stagehand callback batch.
* Keep this function self-contained: its source is serialized into the
* extension service worker with Function#toString.
*/
async function createPlaywrightCompatRuntime(stagehand) {
	const stats = {
		calls: {},
		misses: {}
	};
	const record = (bucket, method) => {
		stats[bucket][method] = (stats[bucket][method] ?? 0) + 1;
	};
	const matcher = (value, exact = false) => value instanceof RegExp ? {
		kind: "regexp",
		source: value.source,
		flags: value.flags
	} : {
		kind: "string",
		value: String(value),
		exact
	};
	const unsupported = (surface, method) => {
		const name = `${surface}.${String(method)}`;
		record("misses", name);
		throw new Error(`Playwright compatibility facade does not implement ${name}`);
	};
	const guard = (surface, target) => new Proxy(target, { get(current, property, receiver) {
		if (property === "then") return void 0;
		if (Reflect.has(current, property)) return Reflect.get(current, property, receiver);
		return (..._args) => unsupported(surface, property);
	} });
	async function executeQueryInPage(input) {
		const normalize = (value) => value.replace(/\s+/gu, " ").trim();
		const matches = (value, expected) => {
			const normalized = normalize(value);
			if (expected.kind === "regexp") return new RegExp(expected.source, expected.flags).test(normalized);
			const target = normalize(expected.value);
			return expected.exact ? normalized === target : normalized.toLocaleLowerCase().includes(target.toLocaleLowerCase());
		};
		const visible = (element) => {
			const style = getComputedStyle(element);
			if (style.visibility === "hidden" || style.display === "none") return false;
			const rect = element.getBoundingClientRect?.();
			return Boolean(rect && rect.width > 0 && rect.height > 0);
		};
		const dedupe = (elements) => {
			const seen = /* @__PURE__ */ new Set();
			return elements.filter((element) => {
				if (seen.has(element)) return false;
				seen.add(element);
				return true;
			});
		};
		const queryCssDeep = (root, selector) => {
			const direct = [...root.querySelectorAll(selector)];
			const ownShadow = root instanceof Element && root.shadowRoot ? queryCssDeep(root.shadowRoot, selector) : [];
			const nested = [...root.querySelectorAll("*")].flatMap((element) => element.shadowRoot ? queryCssDeep(element.shadowRoot, selector) : []);
			return dedupe([
				...direct,
				...ownShadow,
				...nested
			]);
		};
		const smallestTextMatches = (elements, expected) => elements.filter((element) => matches(element.textContent ?? "", expected) && ![...element.children].some((child) => matches(child.textContent ?? "", expected)));
		const queryXPath = (root, expression) => {
			const result = (root instanceof Document ? root : root.ownerDocument).evaluate(expression, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
			const elements = [];
			for (let index = 0; index < result.snapshotLength; index += 1) {
				const node = result.snapshotItem(index);
				if (node instanceof Element) elements.push(node);
			}
			return elements;
		};
		const splitSelectorList = (selector) => {
			const parts = [];
			let start = 0;
			let depth = 0;
			let quote = "";
			for (let index = 0; index < selector.length; index += 1) {
				const character = selector[index];
				if (quote) {
					if (character === quote && selector[index - 1] !== "\\") quote = "";
					continue;
				}
				if (character === "\"" || character === "'") quote = character;
				else if (character === "(" || character === "[") depth += 1;
				else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
				else if (character === "," && depth === 0) {
					parts.push(selector.slice(start, index));
					start = index + 1;
				}
			}
			parts.push(selector.slice(start));
			return parts;
		};
		const querySelector = (root, rawSelector) => {
			const selector = rawSelector.trim();
			if (selector === "..") return root instanceof Element && root.parentElement ? [root.parentElement] : [];
			if (/^(?:xpath=|\/|\()/u.test(selector)) return queryXPath(root, selector.replace(/^xpath=/u, ""));
			if (/^text=/iu.test(selector)) {
				const text = selector.replace(/^text=/iu, "").replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2");
				const regexp = text.match(/^\/(.*)\/([dgimsuvy]*)$/u);
				return smallestTextMatches(queryCssDeep(root, "*"), regexp ? {
					kind: "regexp",
					source: regexp[1] ?? "",
					flags: regexp[2] ?? ""
				} : {
					kind: "string",
					value: text,
					exact: false
				});
			}
			return dedupe(splitSelectorList(selector).flatMap((rawPart) => {
				let part = rawPart.trim().replace(/^css=/u, "");
				if (/^text=/iu.test(part)) {
					const text = part.replace(/^text=/iu, "").replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2");
					const regexp = text.match(/^\/(.*)\/([dgimsuvy]*)$/u);
					return smallestTextMatches(queryCssDeep(root, "*"), regexp ? {
						kind: "regexp",
						source: regexp[1] ?? "",
						flags: regexp[2] ?? ""
					} : {
						kind: "string",
						value: text,
						exact: false
					});
				}
				const requireVisible = /:visible\b/u.test(part);
				part = part.replace(/:visible\b/gu, "").replace(/\s*>>>?\s*/gu, " ");
				const pseudo = part.match(/^(.*?):(has-text|text-is|text)\((['"])(.*?)\3\)(.*)$/u);
				let elements;
				if (pseudo) {
					const anchors = queryCssDeep(root, pseudo[1]?.trim() || "*").filter((element) => matches(element.textContent ?? "", {
						kind: "string",
						value: pseudo[4] ?? "",
						exact: pseudo[2] === "text-is"
					}));
					const suffix = pseudo[5]?.trim();
					elements = suffix ? dedupe(anchors.flatMap((anchor) => queryCssDeep(anchor, suffix))) : anchors;
				} else elements = queryCssDeep(root, part || "*");
				return requireVisible ? elements.filter(visible) : elements;
			}));
		};
		const implicitRole = (element) => {
			const explicit = element.getAttribute("role")?.trim().split(/\s+/u)[0];
			if (explicit) return explicit;
			const tag = element.tagName.toLocaleLowerCase();
			if (tag === "button") return "button";
			if (tag === "a" && element.hasAttribute("href")) return "link";
			if (tag === "img") return "img";
			if (/^h[1-6]$/u.test(tag)) return "heading";
			if (tag === "textarea") return "textbox";
			if (tag === "select") return element.hasAttribute("multiple") ? "listbox" : "combobox";
			if (tag === "option") return "option";
			if (tag === "ul" || tag === "ol") return "list";
			if (tag === "li") return "listitem";
			if (tag === "table") return "table";
			if (tag === "tr") return "row";
			if (tag === "th") return "columnheader";
			if (tag === "td") return "cell";
			if (tag === "nav") return "navigation";
			if (tag === "main") return "main";
			if (tag === "form") return "form";
			if (tag === "input") {
				const type = (element.getAttribute("type") || "text").toLocaleLowerCase();
				if ([
					"button",
					"submit",
					"reset",
					"image"
				].includes(type)) return "button";
				if (type === "checkbox") return "checkbox";
				if (type === "radio") return "radio";
				if (type === "range") return "slider";
				if (type === "number") return "spinbutton";
				if (type === "search") return "searchbox";
				if (!["hidden", "file"].includes(type)) return "textbox";
			}
		};
		const labelText = (element) => {
			const labelledBy = element.getAttribute("aria-labelledby");
			if (labelledBy) {
				const text = labelledBy.split(/\s+/u).map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
				if (normalize(text)) return text;
			}
			const htmlElement = element;
			if (htmlElement.labels?.length) return [...htmlElement.labels].map((label) => label.textContent ?? "").join(" ");
			return "";
		};
		const accessibleName = (element) => {
			const ariaLabel = element.getAttribute("aria-label");
			if (ariaLabel) return ariaLabel;
			const label = labelText(element);
			if (normalize(label)) return label;
			if (element instanceof HTMLImageElement && element.alt) return element.alt;
			if (element instanceof HTMLInputElement && [
				"button",
				"submit",
				"reset"
			].includes(element.type)) return element.value;
			return element.textContent || element.getAttribute("title") || "";
		};
		const descendants = (roots) => dedupe(roots.flatMap((root) => queryCssDeep(root, "*")));
		const resolve = (steps, initialRoots = [document]) => {
			let current = [];
			let roots = initialRoots;
			for (const step of steps) {
				if (step.kind === "selector") current = dedupe(roots.flatMap((root) => querySelector(root, step.value)));
				else if (step.kind === "text") current = smallestTextMatches(descendants(roots), step.matcher);
				else if (step.kind === "attribute") current = descendants(roots).filter((element) => matches(element.getAttribute(step.name) ?? "", step.matcher));
				else if (step.kind === "label") current = descendants(roots).filter((element) => matches(labelText(element), step.matcher));
				else if (step.kind === "role") current = descendants(roots).filter((element) => {
					if (implicitRole(element) !== step.role) return false;
					if (!step.includeHidden && !visible(element)) return false;
					if (step.name && !matches(accessibleName(element), step.name)) return false;
					if (step.checked !== void 0 && element.checked !== step.checked) return false;
					if (step.disabled !== void 0 && element.disabled !== step.disabled) return false;
					if (step.selected !== void 0 && element.selected !== step.selected) return false;
					if (step.expanded !== void 0 && element.getAttribute("aria-expanded") !== String(step.expanded)) return false;
					if (step.pressed !== void 0 && element.getAttribute("aria-pressed") !== String(step.pressed)) return false;
					if (step.level !== void 0 && Number(element.tagName.slice(1)) !== step.level) return false;
					return true;
				});
				else if (step.kind === "filter") current = current.filter((element) => {
					const text = element.textContent ?? "";
					if (step.hasText && !matches(text, step.hasText)) return false;
					if (step.hasNotText && matches(text, step.hasNotText)) return false;
					if (step.visible !== void 0 && visible(element) !== step.visible) return false;
					if (step.has && resolve(step.has, [element]).length === 0) return false;
					if (step.hasNot && resolve(step.hasNot, [element]).length > 0) return false;
					return true;
				});
				else if (step.kind === "nth") {
					const index = step.index < 0 ? current.length + step.index : step.index;
					current = index >= 0 && index < current.length ? [current[index]] : [];
				}
				roots = current;
			}
			return current;
		};
		if (input.operation === "pageContent") return {
			count: 1,
			value: document.documentElement.outerHTML
		};
		if (input.operation === "pageEvaluateHandle") {
			const result = await (0, eval)(`(${input.functionSource})`)(input.argument);
			if (result instanceof Element) {
				const token = input.token;
				result.setAttribute("data-stagehand-pw-compat", token);
				return {
					count: 1,
					token,
					handleKind: "element"
				};
			}
			return {
				count: 1,
				value: result,
				handleKind: "value"
			};
		}
		const elements = resolve(input.plan ?? []);
		const first = elements[0];
		if (input.operation === "inspect") return {
			count: elements.length,
			visible: first ? visible(first) : false
		};
		if (input.operation === "untag") {
			document.querySelectorAll(`[data-stagehand-pw-compat="${CSS.escape(input.token ?? "")}"]`).forEach((element) => element.removeAttribute("data-stagehand-pw-compat"));
			return { count: 0 };
		}
		if (input.operation === "tag") {
			if (!first) return { count: 0 };
			first.setAttribute("data-stagehand-pw-compat", input.token);
			return {
				count: elements.length,
				token: input.token
			};
		}
		if (input.operation === "tagAll") {
			const prefix = input.token;
			const tokens = elements.map((element, index) => {
				const token = `${prefix}-${index}`;
				element.setAttribute("data-stagehand-pw-compat", token);
				return token;
			});
			return {
				count: elements.length,
				values: tokens
			};
		}
		if (input.operation === "allTextContents") return {
			count: elements.length,
			values: elements.map((element) => element.textContent ?? "")
		};
		if (input.operation === "allInnerTexts") return {
			count: elements.length,
			values: elements.map((element) => element.innerText)
		};
		if (input.operation === "evaluateAll") {
			const fn = (0, eval)(`(${input.functionSource})`);
			return {
				count: elements.length,
				value: await fn(elements, input.argument)
			};
		}
		if (!first) return { count: 0 };
		if (input.operation === "textContent") return {
			count: elements.length,
			value: first.textContent
		};
		if (input.operation === "innerText") return {
			count: elements.length,
			value: first.innerText
		};
		if (input.operation === "innerHTML") return {
			count: elements.length,
			value: first.innerHTML
		};
		if (input.operation === "inputValue") return {
			count: elements.length,
			value: first.value
		};
		if (input.operation === "isChecked") return {
			count: elements.length,
			value: Boolean(first.checked)
		};
		if (input.operation === "isDisabled") return {
			count: elements.length,
			value: first.matches(":disabled") || first.getAttribute("aria-disabled")?.toLocaleLowerCase() === "true"
		};
		if (input.operation === "isEnabled") return {
			count: elements.length,
			value: !first.matches(":disabled") && first.getAttribute("aria-disabled")?.toLocaleLowerCase() !== "true"
		};
		if (input.operation === "getAttribute") return {
			count: elements.length,
			value: first.getAttribute(input.attribute)
		};
		if (input.operation === "boundingBox") {
			const rect = first.getBoundingClientRect?.();
			return {
				count: elements.length,
				value: rect ? {
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height
				} : null
			};
		}
		if (input.operation === "focus") {
			first.focus();
			return { count: elements.length };
		}
		if (input.operation === "blur") {
			first.blur();
			return { count: elements.length };
		}
		if (input.operation === "selectText") {
			const selection = window.getSelection();
			const range = document.createRange();
			range.selectNodeContents(first);
			selection?.removeAllRanges();
			selection?.addRange(range);
			return { count: elements.length };
		}
		if (input.operation === "domClick") {
			first.click();
			return { count: elements.length };
		}
		if (input.operation === "scrollIntoView") {
			first.scrollIntoView({
				block: "center",
				inline: "center"
			});
			return { count: elements.length };
		}
		if (input.operation === "evaluate" || input.operation === "elementEvaluateHandle") {
			const result = await (0, eval)(`(${input.functionSource})`)(first, input.argument);
			if (input.operation === "elementEvaluateHandle" && result instanceof Element) {
				const token = input.token;
				result.setAttribute("data-stagehand-pw-compat", token);
				return {
					count: elements.length,
					token,
					handleKind: "element"
				};
			}
			return {
				count: elements.length,
				value: result,
				handleKind: "value"
			};
		}
		return { count: elements.length };
	}
	const buildQueryEvaluationExpression = (query) => {
		return `(async () => {
      const identity = (target) => target;
      for (let index = 0; index <= 32; index += 1) {
        globalThis[index === 0 ? "__name" : "__name" + index] = identity;
      }
      try {
        const execute = (0, eval)("(" + ${JSON.stringify(Function.prototype.toString.call(executeQueryInPage))} + ")");
        return await execute(${JSON.stringify(query)});
      } catch (error) {
        return {
          count: 0,
          error: {
            name: typeof error?.name === "string" ? error.name : "Error",
            message: typeof error?.message === "string" ? error.message : String(error),
            ...(typeof error?.stack === "string" ? { stack: error.stack } : {}),
          },
        };
      }
    })()`;
	};
	const rawContext = stagehand.context;
	const pageKey = (page) => page.pageId ?? page;
	const compatPages = /* @__PURE__ */ new Map();
	const closedPages = /* @__PURE__ */ new Set();
	let closeRequested = false;
	const contextPageListeners = /* @__PURE__ */ new Map();
	const screenshotArtifacts = [];
	const encodeBase64 = (bytes) => {
		let binary = "";
		const chunkSize = 32768;
		for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
		return btoa(binary);
	};
	class CompatLocator {
		plan;
		state;
		constructor(plan, state) {
			this.plan = plan;
			this.state = state;
		}
		derived(step) {
			return locatorProxy(new CompatLocator([...this.plan, step], this.state));
		}
		locator(selector, options = {}) {
			record("calls", "locator.locator");
			const located = this.derived({
				kind: "selector",
				value: selector
			});
			return Object.keys(options).length > 0 ? located.filter(options) : located;
		}
		getByText(value, options = {}) {
			record("calls", "locator.getByText");
			return this.derived({
				kind: "text",
				matcher: matcher(value, options.exact)
			});
		}
		getByRole(role, options = {}) {
			record("calls", "locator.getByRole");
			return this.derived({
				kind: "role",
				role,
				...options.name === void 0 ? {} : { name: matcher(options.name, options.exact === true) },
				...typeof options.checked === "boolean" ? { checked: options.checked } : {},
				...typeof options.disabled === "boolean" ? { disabled: options.disabled } : {},
				...typeof options.selected === "boolean" ? { selected: options.selected } : {},
				...typeof options.expanded === "boolean" ? { expanded: options.expanded } : {},
				...typeof options.pressed === "boolean" ? { pressed: options.pressed } : {},
				...typeof options.includeHidden === "boolean" ? { includeHidden: options.includeHidden } : {},
				...typeof options.level === "number" ? { level: options.level } : {}
			});
		}
		getByLabel(value, options = {}) {
			record("calls", "locator.getByLabel");
			return this.derived({
				kind: "label",
				matcher: matcher(value, options.exact)
			});
		}
		byAttribute(name, value, exact) {
			return this.derived({
				kind: "attribute",
				name,
				matcher: matcher(value, exact)
			});
		}
		getByPlaceholder(value, options = {}) {
			record("calls", "locator.getByPlaceholder");
			return this.byAttribute("placeholder", value, options.exact);
		}
		getByAltText(value, options = {}) {
			record("calls", "locator.getByAltText");
			return this.byAttribute("alt", value, options.exact);
		}
		getByTitle(value, options = {}) {
			record("calls", "locator.getByTitle");
			return this.byAttribute("title", value, options.exact);
		}
		getByTestId(value) {
			record("calls", "locator.getByTestId");
			return this.byAttribute("data-testid", value, true);
		}
		filter(options) {
			record("calls", "locator.filter");
			const has = options.has instanceof CompatLocator ? options.has.plan : void 0;
			const hasNot = options.hasNot instanceof CompatLocator ? options.hasNot.plan : void 0;
			return this.derived({
				kind: "filter",
				...options.hasText === void 0 ? {} : { hasText: matcher(options.hasText) },
				...options.hasNotText === void 0 ? {} : { hasNotText: matcher(options.hasNotText) },
				...has ? { has } : {},
				...hasNot ? { hasNot } : {},
				...typeof options.visible === "boolean" ? { visible: options.visible } : {}
			});
		}
		first() {
			record("calls", "locator.first");
			return this.derived({
				kind: "nth",
				index: 0
			});
		}
		last() {
			record("calls", "locator.last");
			return this.derived({
				kind: "nth",
				index: -1
			});
		}
		nth(index) {
			record("calls", "locator.nth");
			return this.derived({
				kind: "nth",
				index
			});
		}
		async count() {
			record("calls", "locator.count");
			return (await this.state.execute(this.plan, "inspect")).count;
		}
		async all() {
			record("calls", "locator.all");
			const prefix = crypto.randomUUID();
			return (await this.state.execute(this.plan, "tagAll", { token: prefix })).values.map((token) => locatorProxy(new CompatLocator([{
				kind: "selector",
				value: `[data-stagehand-pw-compat="${token}"]`
			}, {
				kind: "nth",
				index: 0
			}], this.state)));
		}
		async allTextContents() {
			record("calls", "locator.allTextContents");
			return (await this.state.execute(this.plan, "allTextContents")).values;
		}
		async allInnerTexts() {
			record("calls", "locator.allInnerTexts");
			return (await this.state.execute(this.plan, "allInnerTexts")).values;
		}
		async singleValue(operation, extra = {}) {
			const result = await this.state.execute(this.plan, operation, extra);
			if (result.count === 0) throw new Error(`locator.${operation}: no element matched`);
			return result.value;
		}
		async textContent() {
			record("calls", "locator.textContent");
			return await this.singleValue("textContent");
		}
		async innerText() {
			record("calls", "locator.innerText");
			return await this.singleValue("innerText");
		}
		async innerHTML() {
			record("calls", "locator.innerHTML");
			return await this.singleValue("innerHTML");
		}
		async inputValue() {
			record("calls", "locator.inputValue");
			return await this.singleValue("inputValue");
		}
		async getAttribute(name) {
			record("calls", "locator.getAttribute");
			return await this.singleValue("getAttribute", { attribute: name });
		}
		async isVisible() {
			record("calls", "locator.isVisible");
			const result = await this.state.execute(this.plan, "inspect");
			return result.count > 0 && result.visible === true;
		}
		async isChecked() {
			record("calls", "locator.isChecked");
			return await this.singleValue("isChecked");
		}
		async isDisabled() {
			record("calls", "locator.isDisabled");
			return await this.singleValue("isDisabled");
		}
		async isEnabled() {
			record("calls", "locator.isEnabled");
			return await this.singleValue("isEnabled");
		}
		async boundingBox() {
			record("calls", "locator.boundingBox");
			const result = await this.state.execute(this.plan, "boundingBox");
			return result.count === 0 ? null : result.value;
		}
		getBoundingClientRect() {
			record("calls", "locator.getBoundingClientRect");
			return this.boundingBox();
		}
		async evaluate(fn, arg) {
			record("calls", "locator.evaluate");
			return await this.singleValue("evaluate", {
				functionSource: Function.prototype.toString.call(fn),
				...arg === void 0 ? {} : { argument: arg }
			});
		}
		async evaluateAll(fn, arg) {
			record("calls", "locator.evaluateAll");
			return (await this.state.execute(this.plan, "evaluateAll", {
				functionSource: Function.prototype.toString.call(fn),
				...arg === void 0 ? {} : { argument: arg }
			})).value;
		}
		async evaluateHandle(fn, arg) {
			record("calls", "locator.evaluateHandle");
			const token = crypto.randomUUID();
			const result = await this.state.execute(this.plan, "elementEvaluateHandle", {
				functionSource: Function.prototype.toString.call(fn),
				...arg === void 0 ? {} : { argument: arg },
				token
			});
			return jsHandle(result, this.state);
		}
		async focus() {
			record("calls", "locator.focus");
			await this.singleValue("focus");
		}
		async blur() {
			record("calls", "locator.blur");
			await this.singleValue("blur");
		}
		async selectText() {
			record("calls", "locator.selectText");
			await this.singleValue("selectText");
		}
		async waitFor(options = {}) {
			record("calls", "locator.waitFor");
			const state = options.state ?? "visible";
			const timeout = options.timeout ?? 3e4;
			const deadline = Date.now() + timeout;
			do {
				const result = await this.state.execute(this.plan, "inspect");
				if (state === "attached" ? result.count > 0 : state === "detached" ? result.count === 0 : state === "hidden" ? result.count === 0 || result.visible !== true : result.count > 0 && result.visible === true) return;
				await this.state.rawPage.waitForTimeout(50);
			} while (Date.now() < deadline);
			throw new Error(`locator.waitFor: timed out after ${timeout}ms waiting for ${state}`);
		}
		async scrollIntoViewIfNeeded() {
			record("calls", "locator.scrollIntoViewIfNeeded");
			await this.singleValue("scrollIntoView");
		}
		async withTaggedTarget(method, action, options = {}) {
			record("calls", method);
			const timeout = options.timeout ?? 3e4;
			const deadline = Date.now() + timeout;
			let result = { count: 0 };
			let lastActionError;
			while (Date.now() <= deadline) {
				result = await this.state.execute(this.plan, "inspect");
				if (result.count > 1) throw new Error(`${method}: strict mode violation: ${result.count} elements matched`);
				if (result.count === 1) {
					await this.state.execute(this.plan, "scrollIntoView").catch(() => void 0);
					const token = crypto.randomUUID();
					await this.state.execute(this.plan, "tag", { token });
					let actionSucceeded = false;
					try {
						await action(this.state.rawPage.locator(`[data-stagehand-pw-compat="${token}"]`));
						actionSucceeded = true;
					} catch (error) {
						lastActionError = error;
						const message = error instanceof Error ? error.message : String(error);
						if (!/(?:not found|could not find|no (?:element|node)|detached|not visible|(?:box model|layout object)|execution context|session|target closed|timed? out|timeout)/iu.test(message) || Date.now() >= deadline) throw error;
					} finally {
						await this.state.execute([], "untag", { token }).catch(() => void 0);
					}
					if (actionSucceeded) {
						await this.state.refreshUrl();
						return;
					}
				}
				if (Date.now() < deadline) await this.state.rawPage.waitForTimeout(50);
			}
			if (lastActionError) throw lastActionError;
			throw new Error(`${method}: no element matched within ${timeout}ms`);
		}
		async click(options = {}) {
			if (options.force === true) {
				record("calls", "locator.click");
				const result = await this.state.execute(this.plan, "inspect");
				if (result.count === 0) throw new Error("locator.click: no element matched");
				if (result.count > 1) throw new Error(`locator.click: strict mode violation: ${result.count} elements matched`);
				await this.state.execute(this.plan, "domClick");
				await this.state.refreshUrl();
				return;
			}
			await this.withTaggedTarget("locator.click", (locator) => locator.click({
				...typeof options.button === "string" ? { button: options.button } : {},
				...typeof options.clickCount === "number" ? { clickCount: options.clickCount } : {}
			}), options);
		}
		async fill(value, options = {}) {
			await this.withTaggedTarget("locator.fill", (locator) => locator.fill(value), options);
		}
		async type(value, options = {}) {
			await this.withTaggedTarget("locator.type", (locator) => locator.type(value, typeof options.delay === "number" ? { delay: options.delay } : void 0), options);
		}
		pressSequentially(value, options = {}) {
			record("calls", "locator.pressSequentially");
			return this.type(value, options);
		}
		async press(key, options = {}) {
			await this.withTaggedTarget("locator.press", async (locator) => {
				await locator.click();
				await this.state.rawPage.keyPress(key, typeof options.delay === "number" ? { delay: options.delay } : void 0);
			}, options);
		}
		async hover(options = {}) {
			await this.withTaggedTarget("locator.hover", (locator) => locator.hover(), options);
		}
		async selectOption(values, options = {}) {
			const requested = Array.isArray(values) ? values : [values];
			const indices = requested.map((value, position) => typeof value === "object" && value !== null && typeof value.index === "number" ? {
				position,
				index: value.index
			} : null).filter((value) => value !== null);
			const indexedValues = indices.length === 0 ? [] : await this.evaluate((element, requestedIndices) => {
				const select = element;
				return requestedIndices.map(({ index }) => select.options[index]?.value ?? null);
			}, indices);
			const normalized = requested.map((value, position) => {
				if (typeof value === "string") return value;
				if (typeof value.value === "string") return value.value;
				if (typeof value.label === "string") return value.label;
				const indexedPosition = indices.findIndex((entry) => entry.position === position);
				const indexedValue = indexedValues[indexedPosition];
				if (typeof indexedValue === "string") return indexedValue;
				throw new Error(`locator.selectOption: option index ${String(value.index)} did not match`);
			});
			let selected = [];
			await this.withTaggedTarget("locator.selectOption", async (locator) => {
				selected = await locator.selectOption(Array.isArray(values) ? normalized : normalized[0]);
			}, options);
			return selected;
		}
		async setInputFiles(files, options = {}) {
			await this.withTaggedTarget("locator.setInputFiles", (locator) => locator.setInputFiles(files), options);
		}
		async check(options = {}) {
			record("calls", "locator.check");
			if (!await this.isChecked()) await this.click(options);
		}
		async uncheck(options = {}) {
			record("calls", "locator.uncheck");
			if (await this.isChecked()) await this.click(options);
		}
		async clear(options = {}) {
			record("calls", "locator.clear");
			await this.fill("", options);
		}
		async $(selector) {
			record("calls", "element.$");
			const locator = (await this.locator(selector).all())[0];
			return locator ? markElementHandle(locator, this.state) : null;
		}
		async $$(selector) {
			record("calls", "element.$$");
			return (await this.locator(selector).all()).map((locator) => markElementHandle(locator, this.state));
		}
		async $eval(selector, fn, arg) {
			record("calls", "element.$eval");
			return this.locator(selector).first().evaluate(fn, arg);
		}
		async $$eval(selector, fn, arg) {
			record("calls", "element.$$eval");
			return this.locator(selector).evaluateAll(fn, arg);
		}
	}
	const locatorProxy = (locator) => guard("locator", locator);
	const handleMetadata = /* @__PURE__ */ new WeakMap();
	const pageStateMetadata = /* @__PURE__ */ new WeakMap();
	const markElementHandle = (locator, state) => {
		handleMetadata.set(locator, {
			element: locator,
			result: {
				count: 1,
				handleKind: "element"
			},
			state
		});
		return locator;
	};
	const jsHandle = (result, state) => {
		const element = result.handleKind === "element" && result.token ? locatorProxy(new CompatLocator([{
			kind: "selector",
			value: `[data-stagehand-pw-compat="${result.token}"]`
		}, {
			kind: "nth",
			index: 0
		}], state)) : null;
		const handle = guard("jsHandle", {
			asElement: () => element,
			jsonValue: async () => result.value,
			evaluate: (fn, arg) => element ? element.evaluate(fn, arg) : state.rawPage.evaluate((payload) => {
				return (0, eval)(`(${payload.functionSource})`)(payload.value, payload.argument);
			}, {
				functionSource: Function.prototype.toString.call(fn),
				...result.value === void 0 ? {} : { value: result.value },
				...arg === void 0 ? {} : { argument: arg }
			}),
			evaluateHandle: (fn, arg) => element?.evaluateHandle(fn, arg) ?? unsupported("jsHandle", "evaluateHandle(value)"),
			dispose: async () => {
				if (result.token) await state.execute([], "untag", { token: result.token });
			},
			$: (selector) => element?.$(selector) ?? null,
			$$: async (selector) => element?.$$(selector) ?? []
		});
		handleMetadata.set(handle, {
			element,
			result,
			state
		});
		return handle;
	};
	let waitForNewPage;
	const createPage = async (page) => {
		const key = pageKey(page);
		const existing = compatPages.get(key);
		if (existing) return existing;
		const state = {
			rawPage: page,
			cachedUrl: await page.url(),
			viewport: await page.evaluate("({ width: innerWidth, height: innerHeight })"),
			closed: false,
			execute: async (plan, operation, extra = {}) => {
				const result = await page.evaluate(buildQueryEvaluationExpression({
					plan,
					operation,
					...extra
				}));
				if (result.error) {
					const error = new Error(result.error.message);
					error.name = result.error.name;
					if (result.error.stack) error.stack = result.error.stack;
					throw error;
				}
				return result;
			},
			refreshUrl: async () => {
				state.cachedUrl = await page.url();
				for (const candidate of await rawContext.pages()) await createPage(candidate);
			}
		};
		const root = () => locatorProxy(new CompatLocator([], state));
		const requestFetch = async (url, options = {}) => {
			record("calls", "request.fetch");
			if (rawContext.request) return await rawContext.request.fetch(url, options);
			const value = await page.evaluate(async (payload) => {
				const result = await fetch(payload.url, payload.options);
				return {
					body: await result.text(),
					headers: Object.fromEntries(result.headers.entries()),
					ok: result.ok,
					status: result.status,
					statusText: result.statusText,
					url: result.url
				};
			}, {
				url,
				options
			});
			return guard("apiResponse", {
				ok: () => value.ok,
				status: () => value.status,
				statusText: () => value.statusText,
				url: () => value.url,
				headers: () => ({ ...value.headers }),
				text: async () => value.body,
				json: async () => JSON.parse(value.body),
				body: async () => new TextEncoder().encode(value.body)
			});
		};
		const request = guard("request", {
			fetch: (url, options) => requestFetch(url, options),
			get: (url, options = {}) => requestFetch(url, {
				...options,
				method: "GET"
			}),
			post: (url, options = {}) => requestFetch(url, {
				...options,
				method: "POST"
			})
		});
		const eventSubscriptions = /* @__PURE__ */ new Map();
		const routeSubscriptions = [];
		const encodeTextBase64 = (value) => {
			const bytes = new TextEncoder().encode(value);
			let binary = "";
			for (const byte of bytes) binary += String.fromCharCode(byte);
			return btoa(binary);
		};
		const networkRequests = /* @__PURE__ */ new Map();
		const requestFromEvent = (event) => {
			const params = event.params ?? {};
			const descriptor = params.request ?? {};
			const headers = descriptor.headers ?? {};
			const requestId = String(params.requestId ?? "");
			const request = guard("request", {
				url: () => String(descriptor.url ?? ""),
				method: () => String(descriptor.method ?? "GET"),
				headers: () => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, String(value)])),
				postData: () => descriptor.postData === void 0 ? null : String(descriptor.postData),
				resourceType: () => String(params.type ?? "other").toLowerCase(),
				isNavigationRequest: () => params.type === "Document"
			});
			if (requestId) networkRequests.set(requestId, request);
			return request;
		};
		const responseFromEvent = (event) => {
			const params = event.params ?? {};
			const descriptor = params.response ?? {};
			const headers = descriptor.headers ?? {};
			const request = networkRequests.get(String(params.requestId ?? ""));
			const status = Number(descriptor.status ?? 0);
			return guard("response", {
				url: () => String(descriptor.url ?? ""),
				status: () => status,
				statusText: () => String(descriptor.statusText ?? ""),
				ok: () => status >= 200 && status <= 299,
				headers: () => Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, String(value)])),
				request: () => request
			});
		};
		const failedRequestFromEvent = (event) => {
			const params = event.params ?? {};
			const request = networkRequests.get(String(params.requestId ?? ""));
			if (!request) return requestFromEvent(event);
			return new Proxy(request, { get(target, property, receiver) {
				if (property === "failure") return () => ({ errorText: String(params.errorText ?? "Request failed") });
				return Reflect.get(target, property, receiver);
			} });
		};
		const consoleMessageFromEvent = (event) => {
			const params = event.params ?? {};
			const text = (Array.isArray(params.args) ? params.args : []).map((entry) => {
				const value = entry ?? {};
				if (value.value !== void 0) return String(value.value);
				if (value.description !== void 0) return String(value.description);
				return String(value.type ?? "");
			}).join(" ");
			return guard("consoleMessage", {
				type: () => String(params.type ?? "log"),
				text: () => text
			});
		};
		const downloadFromEvent = (event) => {
			const params = event.params ?? {};
			const guid = String(params.guid ?? "");
			return guard("download", {
				url: () => String(params.url ?? ""),
				suggestedFilename: () => String(params.suggestedFilename ?? (guid || "download")),
				failure: async () => null,
				path: async () => null,
				cancel: async () => {
					if (guid) await page.sendCDP("Browser.cancelDownload", { guid });
				},
				saveAs: async () => unsupported("download", "saveAs")
			});
		};
		const pageErrorFromEvent = (event) => {
			const details = event.params?.exceptionDetails ?? {};
			const exception = details.exception ?? {};
			const error = new Error(String(exception.description ?? exception.value ?? details.text ?? "Page error"));
			error.name = String(exception.className ?? "Error");
			return error;
		};
		const subscribeEvent = (event, listener, once) => {
			if (event !== "download" && event !== "console" && event !== "request" && event !== "response" && event !== "requestfailed" && event !== "pageerror" && event !== "framenavigated") unsupported("page", `on(${event})`);
			let wrapped = (value) => {
				if (once) {
					const subscriptions = eventSubscriptions.get(event);
					const subscription = subscriptions?.get(listener);
					subscriptions?.delete(listener);
					if (subscriptions?.size === 0) eventSubscriptions.delete(event);
					subscription?.then((active) => active.unsubscribe());
				}
				return listener(event === "download" ? downloadFromEvent(value) : event === "console" ? consoleMessageFromEvent(value) : event === "request" ? requestFromEvent(value) : event === "response" ? responseFromEvent(value) : event === "requestfailed" ? failedRequestFromEvent(value) : event === "pageerror" ? pageErrorFromEvent(value) : pageProxy);
			};
			const primarySubscription = event === "pageerror" ? page.onCDP("Runtime.exceptionThrown", wrapped) : event === "framenavigated" ? page.onCDP("Page.frameNavigated", (value) => {
				if ((value.params?.frame ?? {}).parentId === void 0) return wrapped(value);
			}) : page.on(event, wrapped);
			const requestSubscription = event === "response" || event === "requestfailed" ? page.onCDP("Network.requestWillBeSent", requestFromEvent) : void 0;
			const subscription = requestSubscription ? Promise.all([primarySubscription, requestSubscription]).then(([primary, requests]) => ({ unsubscribe: async () => {
				await Promise.all([primary.unsubscribe(), requests.unsubscribe()]);
			} })) : primarySubscription;
			const subscriptions = eventSubscriptions.get(event) ?? /* @__PURE__ */ new Map();
			subscriptions.set(listener, subscription);
			eventSubscriptions.set(event, subscriptions);
			return subscription;
		};
		const waitForResponse = async (predicate, options = {}) => {
			record("calls", "page.waitForResponse");
			const timeout = options.timeout ?? 3e4;
			return await new Promise((resolve, reject) => {
				let settled = false;
				let subscription;
				const finish = (result, error) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					const subscriptions = eventSubscriptions.get("response");
					subscriptions?.delete(listener);
					if (subscriptions?.size === 0) eventSubscriptions.delete("response");
					subscription.then((active) => active.unsubscribe()).catch(() => void 0);
					if (error) reject(error);
					else resolve(result);
				};
				const listener = async (response) => {
					try {
						if (predicate instanceof RegExp) predicate.lastIndex = 0;
						if (typeof predicate === "function" ? await predicate(response) : predicate instanceof RegExp ? predicate.test(response.url()) : response.url() === predicate) finish(response);
					} catch (error) {
						finish(void 0, error instanceof Error ? error : new Error(String(error)));
					}
				};
				const timer = setTimeout(() => finish(void 0, /* @__PURE__ */ new Error(`page.waitForResponse: timed out after ${timeout}ms`)), timeout);
				subscription = subscribeEvent("response", listener, false);
				subscription.catch((error) => finish(void 0, error instanceof Error ? error : new Error(String(error))));
			});
		};
		const waitForPageEvent = async (event, options = {}) => {
			if (event === "popup") return await waitForNewPage(options);
			if (event !== "download") return unsupported("page", `waitForEvent(${event})`);
			await page.sendCDP("Page.enable").catch(() => void 0);
			await page.sendCDP("Page.setDownloadBehavior", { behavior: "allow" }).catch(() => void 0);
			const timeout = options.timeout ?? 3e4;
			return await new Promise((resolve, reject) => {
				let subscription;
				const listener = (download) => {
					clearTimeout(timer);
					resolve(download);
				};
				const timer = setTimeout(() => {
					const subscriptions = eventSubscriptions.get(event);
					subscriptions?.delete(listener);
					if (subscriptions?.size === 0) eventSubscriptions.delete(event);
					subscription.then((active) => active.unsubscribe());
					reject(/* @__PURE__ */ new Error(`page.waitForEvent(download): timed out after ${timeout}ms`));
				}, timeout);
				subscription = subscribeEvent("download", listener, true);
			});
		};
		const pageObject = {
			goto: async (url, options) => {
				record("calls", "page.goto");
				const response = await page.goto(url, options);
				await state.refreshUrl();
				return response;
			},
			reload: async (options) => {
				record("calls", "page.reload");
				const response = await page.reload(options);
				await state.refreshUrl();
				return response;
			},
			goBack: async (options) => {
				record("calls", "page.goBack");
				const response = await page.goBack(options);
				await state.refreshUrl();
				return response;
			},
			goForward: async (options) => {
				record("calls", "page.goForward");
				const response = await page.goForward(options);
				await state.refreshUrl();
				return response;
			},
			url: () => {
				record("calls", "page.url");
				return state.cachedUrl;
			},
			title: () => {
				record("calls", "page.title");
				return page.title();
			},
			content: async () => {
				record("calls", "page.content");
				return (await state.execute([], "pageContent")).value;
			},
			evaluate: (fn, arg) => {
				record("calls", "page.evaluate");
				const metadata = arg && typeof arg === "object" ? handleMetadata.get(arg) : void 0;
				if (metadata?.element && typeof fn === "function") return metadata.element.evaluate(fn);
				return page.evaluate(fn, arg);
			},
			evaluateHandle: async (fn, arg) => {
				record("calls", "page.evaluateHandle");
				const metadata = arg && typeof arg === "object" ? handleMetadata.get(arg) : void 0;
				if (metadata?.element) return metadata.element.evaluateHandle(fn);
				const token = crypto.randomUUID();
				return jsHandle(await state.execute([], "pageEvaluateHandle", {
					functionSource: Function.prototype.toString.call(fn),
					...arg === void 0 ? {} : { argument: arg },
					token
				}), state);
			},
			locator: (selector, options = {}) => {
				record("calls", "page.locator");
				const located = locatorProxy(new CompatLocator([{
					kind: "selector",
					value: selector
				}], state));
				return Object.keys(options).length > 0 ? located.filter(options) : located;
			},
			getByText: (value, options) => {
				record("calls", "page.getByText");
				return root().getByText(value, options);
			},
			getByRole: (role, options) => {
				record("calls", "page.getByRole");
				return root().getByRole(role, options);
			},
			getByLabel: (value, options) => {
				record("calls", "page.getByLabel");
				return root().getByLabel(value, options);
			},
			getByPlaceholder: (value, options) => root().getByPlaceholder(value, options),
			getByAltText: (value, options) => root().getByAltText(value, options),
			getByTitle: (value, options) => root().getByTitle(value, options),
			getByTestId: (value) => root().getByTestId(value),
			$: async (selector) => {
				record("calls", "page.$");
				const locator = (await pageObject.locator(selector).all())[0];
				return locator ? markElementHandle(locator, state) : null;
			},
			$$: async (selector) => {
				record("calls", "page.$$");
				return (await pageObject.locator(selector).all()).map((locator) => markElementHandle(locator, state));
			},
			$x: async (expression) => {
				record("calls", "page.$x");
				return (await pageObject.locator(`xpath=${expression}`).all()).map((locator) => markElementHandle(locator, state));
			},
			$eval: (selector, fn, arg) => {
				record("calls", "page.$eval");
				return pageObject.locator(selector).first().evaluate(fn, arg);
			},
			$$eval: (selector, fn, arg) => {
				record("calls", "page.$$eval");
				return pageObject.locator(selector).evaluateAll(fn, arg);
			},
			click: (selector, options) => pageObject.locator(selector).click(options),
			hover: (selector, options) => pageObject.locator(selector).hover(options),
			fill: (selector, value, options) => pageObject.locator(selector).fill(value, options),
			type: (selector, value, options) => pageObject.locator(selector).type(value, options),
			press: (selector, key, options) => pageObject.locator(selector).press(key, options),
			focus: (selector) => pageObject.locator(selector).focus(),
			check: (selector, options) => pageObject.locator(selector).check(options),
			uncheck: (selector, options) => pageObject.locator(selector).uncheck(options),
			selectOption: (selector, values, options) => pageObject.locator(selector).selectOption(values, options),
			getAttribute: (selector, name) => pageObject.locator(selector).getAttribute(name),
			textContent: (selector) => pageObject.locator(selector).textContent(),
			innerText: (selector) => pageObject.locator(selector).innerText(),
			inputValue: (selector) => pageObject.locator(selector).inputValue(),
			isVisible: (selector) => pageObject.locator(selector).isVisible(),
			isChecked: (selector) => pageObject.locator(selector).isChecked(),
			isDisabled: (selector) => pageObject.locator(selector).isDisabled(),
			isEnabled: (selector) => pageObject.locator(selector).isEnabled(),
			screenshot: async (options = {}) => {
				record("calls", "page.screenshot");
				const { path: requestedPath, ...supported } = options;
				const inferredType = supported.type === void 0 && typeof requestedPath === "string" && /\.jpe?g$/iu.test(requestedPath) ? "jpeg" : void 0;
				const bytes = await page.screenshot({
					...supported,
					...inferredType ? { type: inferredType } : {}
				});
				if (typeof requestedPath === "string") screenshotArtifacts.push({
					path: requestedPath,
					base64: encodeBase64(bytes)
				});
				return bytes;
			},
			waitForTimeout: async (ms) => {
				record("calls", "page.waitForTimeout");
				await page.waitForTimeout(ms);
				for (const candidate of await rawContext.pages()) await createPage(candidate);
			},
			waitForLoadState: (state = "load", options = {}) => {
				record("calls", "page.waitForLoadState");
				return page.waitForLoadState(state, options.timeout);
			},
			waitForSelector: async (selector, options) => {
				record("calls", "page.waitForSelector");
				return await page.waitForSelector(selector, options) ? pageObject.locator(selector).first() : null;
			},
			waitForNavigation: async (options = {}) => {
				record("calls", "page.waitForNavigation");
				const before = state.cachedUrl;
				const deadline = Date.now() + (options.timeout ?? 3e4);
				while (Date.now() < deadline) {
					const next = await page.url();
					if (next !== before) {
						state.cachedUrl = next;
						if (options.waitUntil) await page.waitForLoadState(options.waitUntil, options.timeout);
						return null;
					}
					await page.waitForTimeout(50);
				}
				throw new Error("page.waitForNavigation: timed out");
			},
			waitForResponse,
			waitForEvent: waitForPageEvent,
			setViewportSize: async (size) => {
				record("calls", "page.setViewportSize");
				state.viewport = {
					width: size.width,
					height: size.height
				};
				await page.setViewportSize(size.width, size.height);
			},
			viewportSize: () => {
				record("calls", "page.viewportSize");
				return state.viewport;
			},
			setExtraHTTPHeaders: (headers) => {
				record("calls", "page.setExtraHTTPHeaders");
				return page.setExtraHTTPHeaders(headers);
			},
			addInitScript: (script, arg) => {
				record("calls", "page.addInitScript");
				return page.addInitScript(script, arg);
			},
			close: async () => {
				record("calls", "page.close");
				await page.close();
				state.closed = true;
				closedPages.add(key);
			},
			isClosed: () => state.closed,
			name: () => "",
			context: () => context,
			bringToFront: async () => {
				record("calls", "page.bringToFront");
				await rawContext.setActivePage(page);
			},
			frames: () => {
				record("calls", "page.frames");
				return [pageProxy];
			},
			on: (event, listener) => {
				record("calls", "page.on");
				subscribeEvent(event, listener, false);
				return pageProxy;
			},
			once: (event, listener) => {
				record("calls", "page.once");
				subscribeEvent(event, listener, true);
				return pageProxy;
			},
			off: (event, listener) => {
				record("calls", "page.off");
				const subscriptions = eventSubscriptions.get(event);
				const subscription = subscriptions?.get(listener);
				subscriptions?.delete(listener);
				if (subscriptions?.size === 0) eventSubscriptions.delete(event);
				subscription?.then((active) => active.unsubscribe());
				return pageProxy;
			},
			removeListener: (event, listener) => {
				record("calls", "page.removeListener");
				const subscriptions = eventSubscriptions.get(event);
				const subscription = subscriptions?.get(listener);
				subscriptions?.delete(listener);
				if (subscriptions?.size === 0) eventSubscriptions.delete(event);
				subscription?.then((active) => active.unsubscribe());
				return pageProxy;
			},
			route: async (pattern, handler) => {
				record("calls", "page.route");
				const urlPattern = typeof pattern === "string" ? pattern : "*";
				await page.sendCDP("Fetch.enable", { patterns: [{ urlPattern }] });
				const subscription = page.onCDP("Fetch.requestPaused", async (event) => {
					const params = event.params ?? {};
					const requestId = String(params.requestId ?? "");
					const cdpRequest = params.request ?? {};
					let handled = false;
					const requestHeaders = cdpRequest.headers ?? {};
					const route = {
						request: () => ({
							url: () => String(cdpRequest.url ?? ""),
							method: () => String(cdpRequest.method ?? "GET"),
							headers: () => ({ ...requestHeaders }),
							postData: () => cdpRequest.postData === void 0 ? null : String(cdpRequest.postData)
						}),
						continue: async (options = {}) => {
							handled = true;
							const headers = options.headers;
							await page.sendCDP("Fetch.continueRequest", {
								requestId,
								...headers ? { headers: Object.entries(headers).map(([name, value]) => ({
									name,
									value
								})) } : {},
								...typeof options.url === "string" ? { url: options.url } : {},
								...typeof options.method === "string" ? { method: options.method } : {},
								...typeof options.postData === "string" ? { postData: encodeTextBase64(options.postData) } : {}
							});
						},
						abort: async (errorReason = "Failed") => {
							handled = true;
							await page.sendCDP("Fetch.failRequest", {
								requestId,
								errorReason
							});
						},
						fulfill: async (options = {}) => {
							handled = true;
							const headers = { ...options.headers ?? {} };
							const responseBody = options.json === void 0 ? typeof options.body === "string" ? options.body : void 0 : JSON.stringify(options.json);
							if (options.json !== void 0 && !("content-type" in headers)) headers["content-type"] = "application/json";
							const body = responseBody === void 0 ? void 0 : encodeTextBase64(responseBody);
							await page.sendCDP("Fetch.fulfillRequest", {
								requestId,
								responseCode: typeof options.status === "number" ? options.status : 200,
								responseHeaders: Object.entries(headers).map(([name, value]) => ({
									name,
									value
								})),
								...body === void 0 ? {} : { body }
							});
						}
					};
					await handler(route);
					if (!handled) await route.continue();
				});
				await subscription;
				routeSubscriptions.push({
					pattern,
					handler,
					subscription
				});
			},
			unroute: async (pattern, handler) => {
				const matches = routeSubscriptions.filter((entry) => entry.pattern === pattern && (handler === void 0 || entry.handler === handler));
				for (const entry of matches) {
					routeSubscriptions.splice(routeSubscriptions.indexOf(entry), 1);
					await (await entry.subscription).unsubscribe();
				}
				if (routeSubscriptions.length === 0) await page.sendCDP("Fetch.disable");
			},
			request,
			accessibility: { snapshot: (options) => page.snapshot(options) },
			keyboard: {
				type: (text, options) => page.type(text, options),
				insertText: (text) => page.type(text),
				press: (key, options) => page.keyPress(key, options)
			},
			mouse: (() => {
				let x = 0;
				let y = 0;
				let down = false;
				return {
					click: (nextX, nextY, options) => page.click(nextX, nextY, options),
					move: async (nextX, nextY) => {
						x = nextX;
						y = nextY;
						await page.hover(x, y);
					},
					wheel: (deltaX, deltaY) => page.scroll(x, y, deltaX, deltaY),
					down: async () => {
						down = true;
					},
					up: async () => {
						if (down) await page.click(x, y);
						down = false;
					}
				};
			})()
		};
		const pageProxy = guard("page", pageObject);
		pageStateMetadata.set(pageProxy, state);
		compatPages.set(key, pageProxy);
		closedPages.delete(key);
		for (const [listener, once] of contextPageListeners) {
			listener(pageProxy);
			if (once) contextPageListeners.delete(listener);
		}
		return pageProxy;
	};
	const initialPage = await createPage(stagehand.page);
	const contextRequest = initialPage.request;
	const initialRawPages = await rawContext.pages();
	for (const page of initialRawPages) await createPage(page);
	waitForNewPage = async (options = {}) => {
		const existing = new Set(compatPages.keys());
		const timeout = options.timeout ?? 3e4;
		const deadline = Date.now() + timeout;
		do {
			for (const candidate of await rawContext.pages()) {
				const key = pageKey(candidate);
				if (!existing.has(key)) return await createPage(candidate);
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		} while (Date.now() < deadline);
		throw new Error(`context.waitForEvent(page): timed out after ${timeout}ms`);
	};
	const contextObject = {
		pages: () => {
			record("calls", "context.pages");
			return [...compatPages.entries()].filter(([key]) => !closedPages.has(key)).map(([, page]) => page);
		},
		newPage: async () => {
			record("calls", "context.newPage");
			return await createPage(await rawContext.newPage());
		},
		cookies: (urls) => {
			record("calls", "context.cookies");
			return rawContext.cookies(urls);
		},
		addCookies: (cookies) => rawContext.addCookies(cookies),
		clearCookies: (options) => {
			record("calls", "context.clearCookies");
			return rawContext.clearCookies(options);
		},
		setExtraHTTPHeaders: (headers) => rawContext.setExtraHTTPHeaders(headers),
		addInitScript: (script, arg) => {
			record("calls", "context.addInitScript");
			return rawContext.addInitScript(script, arg);
		},
		waitForEvent: (event, options) => {
			if (event !== "page") return unsupported("context", `waitForEvent(${event})`);
			return waitForNewPage(options);
		},
		on: (event, listener) => {
			record("calls", "context.on");
			if (event !== "page") return unsupported("context", `on(${event})`);
			contextPageListeners.set(listener, false);
			return context;
		},
		once: (event, listener) => {
			record("calls", "context.once");
			if (event !== "page") return unsupported("context", `once(${event})`);
			contextPageListeners.set(listener, true);
			return context;
		},
		off: (event, listener) => {
			record("calls", "context.off");
			if (event !== "page") return unsupported("context", `off(${event})`);
			contextPageListeners.delete(listener);
			return context;
		},
		removeListener: (event, listener) => {
			record("calls", "context.removeListener");
			if (event !== "page") return unsupported("context", `removeListener(${event})`);
			contextPageListeners.delete(listener);
			return context;
		},
		newCDPSession: async (compatPage) => {
			record("calls", "context.newCDPSession");
			const target = pageStateMetadata.get(compatPage);
			if (!target) throw new Error("context.newCDPSession: page does not belong to this context");
			const subscriptions = [];
			return guard("cdpSession", {
				send: (method, params) => target.rawPage.sendCDP(method, params),
				on: (method, listener) => {
					subscriptions.push(target.rawPage.onCDP(method, (event) => listener(event.params ?? {})));
				},
				detach: async () => {
					await Promise.all(subscriptions.map(async (subscription) => (await subscription).unsubscribe()));
				}
			});
		},
		request: contextRequest
	};
	const context = guard("context", contextObject);
	return {
		page: initialPage,
		context,
		browser: guard("browser", {
			contexts: () => [context],
			isConnected: () => !closeRequested,
			close: async () => {
				record("calls", "browser.close");
				closeRequested = true;
			},
			newContext: async () => {
				record("calls", "browser.newContext");
				return context;
			},
			newPage: () => contextObject.newPage()
		}),
		telemetry: () => ({
			calls: { ...stats.calls },
			misses: { ...stats.misses }
		}),
		artifacts: () => screenshotArtifacts.map((artifact) => ({ ...artifact })),
		closeRequested: () => closeRequested
	};
}
//#endregion
//#region src/facade/tools.ts
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const actionRunner = new AsyncFunction("stagehand", "input", `"use strict";
let completed = 0;
for (const action of input.actions) {
  const locator = stagehand.page.locator(action.selector);
  switch (action.op) {
    case "click": await locator.click(); break;
    case "hover": await locator.hover(); break;
    case "fill": await locator.fill(action.value); break;
    case "type": await locator.type(action.text, action.delay === undefined ? undefined : { delay: action.delay }); break;
    case "press": await locator.click(); await stagehand.page.keyPress(action.key); break;
    case "select": await locator.selectOption(action.values); break;
    default: throw new Error("Unsupported ref action: " + String(action.op));
  }
  completed += 1;
}
return { completed };`);
const FACADE_PRELUDE = `"use strict";
const __stagehandCompatIdentity = (target) => target;
for (let index = 0; index <= 32; index += 1) {
  globalThis[index === 0 ? "__name" : "__name" + index] = __stagehandCompatIdentity;
}
const createRuntime = ${createPlaywrightCompatRuntime.toString()};
const runtime = await createRuntime(batchStagehand);
const page = runtime.page;
const context = runtime.context;
const browser = runtime.browser;
const console = globalThis.console;
let value;
let executionError;
try {
  value = await (async () => { `;
const FACADE_EPILOGUE = `
  })();
} catch (error) {
  executionError = {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
    ...(typeof error?.stack === "string" ? { stack: error.stack } : {}),
  };
}
return {
  __stagehandPlaywrightCompat: true,
  value,
  executionError,
};`;
var StagehandFacadeTools = class {
	stagehand;
	snapshotsByPage = /* @__PURE__ */ new Map();
	queue = Promise.resolve();
	constructor(stagehand) {
		this.stagehand = stagehand;
	}
	snapshot(options = {}) {
		return this.enqueue(() => this.snapshotNow(options));
	}
	screenshot(options = {}) {
		return this.enqueue(() => this.screenshotNow(options));
	}
	runActions(actions) {
		return this.enqueue(() => this.runActionsNow(actions));
	}
	run(code) {
		return this.enqueue(() => this.runNow(code));
	}
	async snapshotNow(options) {
		const page = await this.activePage();
		const snapshot = await page.snapshot({ includeIframes: options.includeIframes ?? true });
		this.snapshotsByPage.set(page.pageId, {
			url: await page.url(),
			xpathById: { ...snapshot.xpathMap }
		});
		return snapshot.formattedTree;
	}
	async screenshotNow(options) {
		const page = await this.activePage();
		const type = options.type ?? "png";
		const quality = type === "jpeg" && options.quality !== void 0 ? Math.round(options.quality) : void 0;
		const bytes = await page.screenshot({
			type,
			...options.fullPage === void 0 ? {} : { fullPage: options.fullPage },
			...quality === void 0 ? {} : { quality }
		});
		return {
			data: Buffer.from(bytes).toString("base64"),
			mimeType: type === "jpeg" ? "image/jpeg" : "image/png"
		};
	}
	async runActionsNow(actions) {
		const parsed = RefActionSchema.array().min(1).parse(actions);
		const page = await this.activePage();
		const snapshot = this.snapshotsByPage.get(page.pageId);
		if (!snapshot) throw new Error(NO_HYDRATED_SNAPSHOT_ERROR);
		if (await page.url() !== snapshot.url) {
			this.snapshotsByPage.delete(page.pageId);
			throw new Error(NAVIGATED_SNAPSHOT_ERROR);
		}
		const hydrated = parsed.map((action) => {
			const xpath = trimTrailingTextNode(snapshot.xpathById[action.id]);
			if (!xpath) throw new Error(staleSnapshotIdError(action.id));
			return {
				...action,
				selector: `xpath=${xpath}`
			};
		});
		return {
			completed: (await this.stagehand.experimentalBatch(actionRunner, { actions: hydrated }, {
				page,
				timeout: 6e4
			}))?.completed ?? hydrated.length,
			url: await page.url()
		};
	}
	async runNow(code) {
		const page = await this.activePage();
		const callback = new AsyncFunction("batchStagehand", "input", FACADE_PRELUDE + code + FACADE_EPILOGUE);
		const envelope = await this.stagehand.experimentalBatch(callback, {}, {
			page,
			timeout: 6e4
		});
		if (envelope.executionError) {
			const error = new Error(envelope.executionError.message);
			error.name = envelope.executionError.name;
			if (envelope.executionError.stack) error.stack = envelope.executionError.stack;
			throw error;
		}
		return envelope.value;
	}
	async activePage() {
		const page = await this.stagehand.browser.context.activePage();
		if (!page) throw new Error("Stagehand has no active page.");
		return page;
	}
	enqueue(operation) {
		const result = this.queue.then(operation, operation);
		this.queue = result.then(() => void 0, () => void 0);
		return result;
	}
};
function trimTrailingTextNode(path) {
	return path?.replace(/\/text\(\)(\[\d+\])?$/iu, "");
}
//#endregion
//#region src/facade/config.ts
var StagehandFacadeConfigError = class extends Error {
	name = "StagehandFacadeConfigError";
};
function stagehandFacadeConfigFromEnv(env = process.env) {
	const browserbaseApiKey = nonEmpty(env.BROWSERBASE_API_KEY);
	const browserbaseProjectId = nonEmpty(env.BROWSERBASE_PROJECT_ID);
	const requestedBrowser = nonEmpty(env.STAGEHAND_BROWSER);
	if (requestedBrowser && requestedBrowser !== "local" && requestedBrowser !== "browserbase") throw new StagehandFacadeConfigError("STAGEHAND_BROWSER must be either \"local\" or \"browserbase\".");
	const browserType = requestedBrowser ?? (browserbaseApiKey ? "browserbase" : "local");
	if (browserType === "browserbase" && !browserbaseApiKey) throw new StagehandFacadeConfigError("BROWSERBASE_API_KEY is required when STAGEHAND_BROWSER=\"browserbase\".");
	const explicitModelName = nonEmpty(env.STAGEHAND_MODEL_NAME);
	const explicitModelApiKey = nonEmpty(env.STAGEHAND_MODEL_API_KEY);
	if (explicitModelApiKey && !explicitModelName) throw new StagehandFacadeConfigError("STAGEHAND_MODEL_NAME is required when STAGEHAND_MODEL_API_KEY is set.");
	const inferredGoogleKey = providerApiKey("google", env);
	const modelName = explicitModelName ?? (inferredGoogleKey ? "google/gemini-3.6-flash" : void 0);
	const modelProvider = modelName ? providerName(modelName) : void 0;
	const modelApiKey = explicitModelApiKey ?? providerApiKey(modelProvider, env);
	const parsed = StagehandClientCreateConfigSchema.safeParse({
		logging: { level: "off" },
		...modelName ? { model: {
			modelName,
			...modelApiKey ? { apiKey: modelApiKey } : {},
			...modelProvider === "anthropic" ? { headers: { "anthropic-dangerous-direct-browser-access": "true" } } : {}
		} } : {}
	});
	if (!parsed.success) throw new StagehandFacadeConfigError(`Unsupported STAGEHAND_MODEL_NAME "${modelName}": ${parsed.error.issues[0]?.message ?? "invalid model configuration"}`);
	const stagehand = parsed.data;
	return {
		browser: browserType === "browserbase" ? {
			type: "browserbase",
			launchOptions: {
				apiKey: browserbaseApiKey,
				...browserbaseProjectId ? { projectId: browserbaseProjectId } : {}
			}
		} : {
			type: "local",
			launchOptions: { headless: false }
		},
		stagehand
	};
}
function nonEmpty(value) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : void 0;
}
function providerName(modelName) {
	return modelName.split("/", 1)[0] ?? "";
}
function providerApiKey(provider, env) {
	switch (provider) {
		case "google": return nonEmpty(env.GOOGLE_GENERATIVE_AI_API_KEY) ?? nonEmpty(env.GEMINI_API_KEY) ?? nonEmpty(env.GOOGLE_API_KEY);
		case "openai": return nonEmpty(env.OPENAI_API_KEY);
		case "anthropic": return nonEmpty(env.ANTHROPIC_API_KEY);
		case "groq": return nonEmpty(env.GROQ_API_KEY);
		case "cerebras": return nonEmpty(env.CEREBRAS_API_KEY);
		default: return;
	}
}
//#endregion
export { ScreenshotInputSchema as _, FACADE_AGENT_INSTRUCTIONS as a, NO_HYDRATED_SNAPSHOT_ERROR as c, RefActionSchema as d, SCREENSHOT_INPUT_SCHEMA as f, STALE_SNAPSHOT_ID_ERROR as g, SNAPSHOT_TOOL_DESCRIPTION as h, CodeModeRunInputSchema as i, RUN_INPUT_SCHEMA as l, SNAPSHOT_INPUT_SCHEMA as m, stagehandFacadeConfigFromEnv as n, FACADE_TOOLS as o, SCREENSHOT_TOOL_DESCRIPTION as p, StagehandFacadeTools as r, NAVIGATED_SNAPSHOT_ERROR as s, StagehandFacadeConfigError as t, RUN_TOOL_DESCRIPTION as u, SnapshotInputSchema as v, staleSnapshotIdError as y };

//# sourceMappingURL=config-BXSox97Y.mjs.map

