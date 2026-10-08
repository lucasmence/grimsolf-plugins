import * as vscode from "vscode";
import { TriggerTypeDef, getDefs, buildUsageSnippet, markdownDoc } from "./defs";

// Double quote constant: avoids backslash-quote escapes inside strings.
const DQ: string = String.fromCharCode(34);

export type LineKind = "event" | "condition" | "action" | "none";

// ---------------------------------------------------------------------------
// Line context detection
// ---------------------------------------------------------------------------

// Returns which list a line belongs to, based on the nearest block key
// (events / conditions / conditions-or / then / else) found above it.
export function lineKind(document: vscode.TextDocument, line: number): LineKind
{
    const blockMap: Record<string, LineKind> = {
        events: "event",
        conditions: "condition",
        "conditions-or": "condition",
        then: "action",
        else: "action"
    };

    for (let i = line; i >= 0; i--)
    {
        const text = document.lineAt(i).text;

        const entryMatch = text.match(/^\s*-\s*(event|condition|action)\s*:/);
        if (entryMatch)
            return entryMatch[1] as LineKind;

        const blockMatch = text.match(/^\s*(events|conditions-or|conditions|then|else)\s*:/);
        if (blockMatch)
            return blockMap[blockMatch[1]];
    }
    return "none";
}

// Suggests the type list for the kind of list the cursor is in, inferring the
// kind from the nearest block key above (or from a partially typed prefix).
function suggestedKind(document: vscode.TextDocument, line: number, prefix: string): LineKind
{
    const context = lineKind(document, line);
    if (context !== "none")
        return context;

    if (prefix.startsWith("ev"))
        return "event";
    if (prefix.startsWith("co"))
        return "condition";
    if (prefix.startsWith("ac"))
        return "action";
    return "none";
}

function defsForKind(kind: LineKind): TriggerTypeDef[]
{
    const defs = getDefs();
    if (kind === "event")
        return defs.events;
    if (kind === "condition")
        return defs.conditions;
    if (kind === "action")
        return defs.actions;
    return [];
}

function kindLabel(kind: LineKind): string
{
    return kind === "event" ? "event" : kind === "condition" ? "condition" : "action";
}

// ---------------------------------------------------------------------------
// Completion provider
// ---------------------------------------------------------------------------

export class TriggerCompletionProvider implements vscode.CompletionItemProvider
{
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] | undefined
    {
        const lineText = document.lineAt(position.line).text.substring(0, position.character);

        // 1) "kind: " completion inside an entry: the type value list.
        const kindKeyMatch = lineText.match(/(^|\s)(event|condition|action)\s*:\s*"?([^"\s]*)$/);
        if (kindKeyMatch)
        {
            const kind = kindKeyMatch[2] as LineKind;
            return defsForKind(kind).map((def) =>
            {
                const item = new vscode.CompletionItem(def.key, vscode.CompletionItemKind.EnumMember);
                item.detail = def.description;
                item.insertText = new vscode.SnippetString(DQ + def.key + DQ);
                return item;
            });
        }

        // 2) "- " completion inside a trigger list: inserts the whole entry.
        const entryMatch = lineText.match(/^(\s*)-(\s*)([a-z]*)$/);
        if (entryMatch)
        {
            const prefix = entryMatch[3];
            const kind = suggestedKind(document, position.line, prefix);
            const defs = defsForKind(kind);

            if (defs.length === 0 && prefix === "")
            {
                return ["event", "condition", "action"].map((k) =>
                {
                    const item = new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword);
                    item.detail = "Insert a " + k + " entry (the list is suggested next)";
                    item.insertText = new vscode.SnippetString(k + ": " + DQ + DQ);
                    return item;
                });
            }

            return defs.map((def) =>
            {
                const item = new vscode.CompletionItem({
                    label: def.key,
                    description: kindLabel(kind)
                }, vscode.CompletionItemKind.Snippet);
                item.detail = def.description;
                item.insertText = new vscode.SnippetString(
                    buildUsageSnippet(def, kindLabel(kind), false));
                item.documentation = markdownDoc(def, kindLabel(kind));
                return item;
            });
        }

        // 3) Top-level/param keys completion on empty lines.
        const keyMatch = lineText.match(/^(\s*)([a-zA-Z-]*)$/);
        if (keyMatch)
        {
            const keys: Array<[string, string]> = [
                ["trigger", "Top-level trigger list"],
                ["events", "Trigger block events"],
                ["conditions", "Trigger block AND conditions"],
                ["conditions-or", "Trigger block OR conditions"],
                ["then", "Actions when conditions pass"],
                ["else", "Actions when conditions fail"],
                ["event", "Event type key"],
                ["condition", "Condition type key"],
                ["action", "Action type key"],
                ["floatValue", "Scalar float parameter"],
                ["integerValue", "Scalar integer parameter"],
                ["unitName", "Unit name parameter"],
                ["text", "Text parameter"],
                ["strings", "String list parameter"],
                ["integers", "Integer list parameter"],
                ["floats", "Float list parameter"],
                ["booleans", "Boolean list parameter"],
                ["item-drop", "Top-level item drop list"],
                ["item-drop-list", "Top-level item drop list"],
                ["environments-drop", "Top-level environment drop list"],
                ["player-characters", "Top-level player characters list"]
            ];

            return keys
                .filter(([key]) => key.startsWith(keyMatch[2]))
                .map(([key, detail]) =>
                {
                    const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
                    item.detail = detail;
                    item.insertText = new vscode.SnippetString(key + ": ");
                    return item;
                });
        }

        return undefined;
    }
}

// ---------------------------------------------------------------------------
// Hover provider
// ---------------------------------------------------------------------------

export class TriggerHoverProvider implements vscode.HoverProvider
{
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined
    {
        const range = document.getWordRangeAtPosition(position, /[a-z0-9-]+/);
        if (!range)
            return undefined;

        const word = document.getText(range);
        const defs = getDefs();
        const all: Array<[TriggerTypeDef, string]> = [
            ...defs.events.map((d) => [d, "event"] as [TriggerTypeDef, string]),
            ...defs.conditions.map((d) => [d, "condition"] as [TriggerTypeDef, string]),
            ...defs.actions.map((d) => [d, "action"] as [TriggerTypeDef, string])
        ];

        const def = all.find(([d]) => d.key === word);
        if (def)
            return new vscode.Hover(markdownDoc(def[0], def[1]), range);

        return undefined;
    }
}

// ---------------------------------------------------------------------------
// Diagnostics (validation)
// ---------------------------------------------------------------------------

// Structure mirrors TriggerEditor::checkTriggerSyntax from the realm-editor:
// unknown type names get a "did you mean" hint (Levenshtein), unknown fields
// and missing "value" keys are reported per entry.
function editDistance(a: string, b: string): number
{
    const row = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++)
        row[j] = j;

    for (let i = 1; i <= a.length; i++)
    {
        let previous = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++)
        {
            const current = row[j];
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
            previous = current;
        }
    }
    return row[b.length];
}

function closestName(value: string, names: string[]): string | null
{
    let best: string | null = null;
    let bestDistance = 0;
    for (const name of names)
    {
        const distance = editDistance(value, name);
        if (best === null || distance < bestDistance)
        {
            best = name;
            bestDistance = distance;
        }
    }
    const limit = Math.max(2, Math.floor(value.length / 3));
    return best !== null && bestDistance <= limit ? best : null;
}

interface ParsedEntry
{
    kind: LineKind;
    typeKey: string;
    typeValue: string;
    fields: string[];
    entryLine: number;
    blockLabel: string;
}

interface ParseResult
{
    entries: ParsedEntry[];
    blockLabels: Map<number, string>;
}

// Minimal YAML-ish parser over the trigger structure: walks lines, tracks
// indent-based nesting and collects entries (event/condition/action records).
function parseTriggerDocument(document: vscode.TextDocument): ParseResult
{
    const entries: ParsedEntry[] = [];
    const blockLabels = new Map<number, string>();

    let blockIndex = 0;
    let currentBlockLabel = "";
    let currentEntry: ParsedEntry | null = null;

    for (let i = 0; i < document.lineCount; i++)
    {
        const raw = document.lineAt(i).text;
        const noComment = raw.replace(/#.*$/, "");
        if (noComment.trim() === "")
            continue;

        const content = noComment.trim();
        const isItem = content.startsWith("- ");
        const itemContent = isItem ? content.substring(2).trim() : content;

        // New trigger block ("- events:").
        if (isItem && itemContent.startsWith("events:"))
        {
            blockIndex++;
            currentBlockLabel = "trigger block " + blockIndex;
            blockLabels.set(i, currentBlockLabel);
            currentEntry = null;
            continue;
        }

        // New block key inside a block ("conditions:", "then:", ...).
        if (/^(events|conditions-or|conditions|then|else)\s*:/.test(itemContent))
        {
            currentEntry = null;
            continue;
        }

        // New entry ("- action: x" / "- event: x").
        const entryMatch = isItem ? itemContent.match(/^(event|condition|action)\s*:\s*(.*)$/) : null;
        if (entryMatch)
        {
            const kind = entryMatch[1] as LineKind;
            const typeValue = entryMatch[2].replace(/^["']|["']$/g, "").trim();
            currentEntry = {
                kind,
                typeKey: entryMatch[1],
                typeValue,
                fields: [entryMatch[1]],
                entryLine: i,
                blockLabel: currentBlockLabel || "trigger"
            };
            entries.push(currentEntry);
            continue;
        }

        if (!currentEntry)
            continue;

        // Field keys inside an entry ("strings:", "floatValue:" ...).
        const fieldMatch = itemContent.match(/^([a-zA-Z-]+)\s*:/);
        if (fieldMatch && !currentEntry.fields.includes(fieldMatch[1]))
            currentEntry.fields.push(fieldMatch[1]);
    }

    return { entries, blockLabels };
}

export class TriggerDiagnosticProvider
{
    private collection: vscode.DiagnosticCollection;

    constructor(collection: vscode.DiagnosticCollection)
    {
        this.collection = collection;
    }

    update(document: vscode.TextDocument): void
    {
        if (document.languageId !== "grimsolf-trigger")
            return;

        const diagnostics: vscode.Diagnostic[] = [];

        const knownBlockKeys = ["events", "conditions", "conditions-or", "then", "else"];
        const knownFields = ["floatValue", "integerValue", "unitName", "text", "strings", "integers", "floats", "booleans"];

        const { entries } = parseTriggerDocument(document);
        const entryStartLines = new Set<number>();
        for (const entry of entries)
            entryStartLines.add(entry.entryLine);

        let inTrigger = false;
        let currentEntry: ParsedEntry | null = null;

        for (let i = 0; i < document.lineCount; i++)
        {
            const raw = document.lineAt(i).text;
            const noComment = raw.replace(/#.*$/, "");
            const trimmed = noComment.trim();
            if (trimmed === "")
                continue;

            const isItem = trimmed.startsWith("- ");
            const content = isItem ? trimmed.substring(2).trim() : trimmed;

            if (content.startsWith("trigger"))
            {
                inTrigger = content.includes(":");
                currentEntry = null;
                continue;
            }

            if (!inTrigger)
                continue;

            // Entry start lines: validate the type name.
            const entry = entries.find((e) => e.entryLine === i);
            if (entry)
            {
                currentEntry = entry;
                const names = defsForKind(entry.kind).map((d) => d.key);
                if (entry.typeValue !== "" && !names.includes(entry.typeValue))
                {
                    const suggestion = closestName(entry.typeValue, names);
                    diagnostics.push(this.warning(
                        i, 0, raw.length,
                        "Unknown " + kindLabel(entry.kind) + " " + DQ + entry.typeValue + DQ
                        + (suggestion ? ". Did you mean " + DQ + suggestion + DQ + "?" : "")
                    ));
                }
                continue;
            }

            // Skip "- value: x" list items.
            if (isItem && /^value\s*:/.test(content))
                continue;

            // Field lines: unknown block keys (outside entries) or unknown
            // fields (inside entries).
            const keyMatch = content.match(/^([a-zA-Z-]+)\s*:/);
            if (keyMatch)
            {
                const key = keyMatch[1];

                if (!currentEntry)
                {
                    if (key === "events")
                        continue;
                    if (!knownBlockKeys.includes(key))
                    {
                        const suggestion = closestName(key, knownBlockKeys);
                        diagnostics.push(this.warning(
                            i, noComment.indexOf(key), key.length,
                            "Unknown block key " + DQ + key + DQ
                            + (suggestion ? ". Did you mean " + DQ + suggestion + DQ + "?" : "")
                        ));
                    }
                    continue;
                }

                if (!knownFields.includes(key) && !knownBlockKeys.includes(key))
                {
                    const suggestion = closestName(key, knownFields);
                    diagnostics.push(this.warning(
                        i, noComment.indexOf(key), key.length,
                        "Unknown field " + DQ + key + DQ
                        + (suggestion ? ". Did you mean " + DQ + suggestion + DQ + "?" : "")
                    ));
                }
            }
        }

        this.collection.set(document.uri, diagnostics);
    }

    clear(document: vscode.TextDocument): void
    {
        this.collection.delete(document.uri);
    }

    private warning(line: number, startCol: number, length: number, message: string): vscode.Diagnostic
    {
        const range = new vscode.Range(line, Math.max(0, startCol), line, Math.max(0, startCol) + Math.max(1, length));
        return new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function registerCommands(context: vscode.ExtensionContext): void
{
    const insertTriggerBlock = vscode.commands.registerCommand("grimsolfTrigger.insertTriggerBlock", async () =>
    {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;

        // Snippet assembled without escaped quotes inside string literals.
        const lines = [
            "trigger:",
            "  - events:",
            "      - event: ${1|initialization,region-entered,unit-kill,call-event|}",
            "    conditions: []",
            "    then:",
            "      - action: ${2:system-sleep}",
            "        floatValue: ${3:1.0}",
            "    else: []"
        ];
        const snippet = new vscode.SnippetString(lines.join("\n") + "\n");
        await editor.insertSnippet(snippet);
    });

    const insertEntry = vscode.commands.registerCommand("grimsolfTrigger.insertEntry", async () =>
    {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "grimsolf-trigger")
            return;

        const kind = await vscode.window.showQuickPick(["event", "condition", "action"], {
            placeHolder: "Which entry type to insert?"
        });
        if (!kind)
            return;

        const defs = defsForKind(kind as LineKind);
        const selected = await vscode.window.showQuickPick(defs.map((d) => ({
            label: d.key,
            description: d.description,
            def: d
        })), {
            placeHolder: "Select the " + kind + " (" + defs.length + " available)"
        });
        if (!selected)
            return;

        const snippet = new vscode.SnippetString(buildUsageSnippet(selected.def, kind));
        await editor.insertSnippet(snippet);
    });

    context.subscriptions.push(insertTriggerBlock, insertEntry);
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void
{
    const selector: vscode.DocumentSelector = { language: "grimsolf-trigger" };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(selector, new TriggerCompletionProvider(),
            " ", "-", ":", DQ)
    );
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(selector, new TriggerHoverProvider())
    );

    const collection = vscode.languages.createDiagnosticCollection("grimsolf-trigger");
    const diagnostics = new TriggerDiagnosticProvider(collection);
    context.subscriptions.push(collection);

    const update = (document: vscode.TextDocument | undefined) =>
    {
        if (document)
            diagnostics.update(document);
    };

    if (vscode.window.activeTextEditor)
        update(vscode.window.activeTextEditor.document);

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(update),
        vscode.workspace.onDidChangeTextDocument((event) => update(event.document)),
        vscode.window.onDidChangeActiveTextEditor((editor) => update(editor?.document))
    );

    registerCommands(context);
}

export function deactivate(): void
{
    // nothing to clean up
}
