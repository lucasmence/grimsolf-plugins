import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Grimsolf Trigger metadata (extracted from triggerDefs.cpp)
// ---------------------------------------------------------------------------

export interface TriggerParam
{
    field: string;   // json field name
    index: number;   // array index; -1 for scalar fields
    label: string;
    type: "string" | "int" | "float" | "bool";
    required: boolean;
}

export interface TriggerTypeDef
{
    key: string;
    description: string;
    params: TriggerParam[];
}

export interface TriggerDefs
{
    events: TriggerTypeDef[];
    conditions: TriggerTypeDef[];
    actions: TriggerTypeDef[];
}

let cachedDefs: TriggerDefs | null = null;

export function getDefs(): TriggerDefs
{
    if (cachedDefs)
        return cachedDefs;

    const defsPath = path.join(__dirname, "..", "trigger-defs.json");
    cachedDefs = JSON.parse(fs.readFileSync(defsPath, "utf8")) as TriggerDefs;
    return cachedDefs;
}

// Renders a usage snippet for a trigger type, following the same parameter
// layout the engine reads (strings/integers/floats/booleans + scalar fields).
// Indentation is RELATIVE: the editor prepends the whitespace before the
// cursor to every continuation line (SnippetSession.adjustWhitespace), so
// writing absolute indent here would double it.
// When `withDash` is false the leading "- " is omitted (used when the line
// already contains the dash and completion fills in the rest of the entry).
export function buildUsageSnippet(def: TriggerTypeDef, kind: string, withDash: boolean = true): string
{
    const lines: string[] = [];

    const firstLinePrefix = withDash ? "- " : "";
    lines.push(`${firstLinePrefix}${kind}: "\${1:${def.key}}"`);

    // Scalar params first (field directly on the entry), then list params.
    const scalars = def.params.filter((p) => p.index === -1);
    const lists = def.params.filter((p) => p.index >= 0);

    let scalarSnippetIndex = 2;
    for (const param of scalars)
    {
        const value = param.type === "bool" ? "true"
            : param.type === "int" ? "0"
            : param.type === "float" ? "0.0"
            : `"\${${scalarSnippetIndex}:text}"`;
        lines.push(`  ${param.field}: ${value}`);
        scalarSnippetIndex++;
    }

    // Group list params by field name preserving first-seen order.
    const listFields: string[] = [];
    const maxIndex: Record<string, number> = {};
    for (const param of lists)
    {
        if (!listFields.includes(param.field))
        {
            listFields.push(param.field);
            maxIndex[param.field] = param.index;
        }
        else if (param.index > maxIndex[param.field])
        {
            maxIndex[param.field] = param.index;
        }
    }

    for (const field of listFields)
    {
        lines.push(`  ${field}:`);
        const count = maxIndex[field] + 1;
        for (let i = 0; i < count; i++)
        {
            const param = lists.find((p) => p.field === field && p.index === i);
            const placeholder = param ? `${param.label} (${param.type})` : "value";
            lines.push(`    - value: "\${${scalarSnippetIndex}:${placeholder}}"`);
            scalarSnippetIndex++;
        }
    }

    return lines.join("\n");
}

export function buildUsageText(def: TriggerTypeDef, kind: string): string
{
    const lines: string[] = [];

    lines.push(`- ${kind}: "${def.key}"`);

    const scalars = def.params.filter((p) => p.index === -1);
    const lists = def.params.filter((p) => p.index >= 0);

    for (const param of scalars)
    {
        const value = param.type === "bool" ? "true"
            : param.type === "int" ? "0"
            : param.type === "float" ? "0.0"
            : `"..."`;
        lines.push(`  ${param.field}: ${value}${param.required ? "" : "   # optional"}`);
    }

    const listFields: string[] = [];
    const maxIndex: Record<string, number> = {};
    for (const param of lists)
    {
        if (!listFields.includes(param.field))
        {
            listFields.push(param.field);
            maxIndex[param.field] = param.index;
        }
        else if (param.index > maxIndex[param.field])
        {
            maxIndex[param.field] = param.index;
        }
    }

    for (const field of listFields)
    {
        lines.push(`  ${field}:`);
        const count = maxIndex[field] + 1;
        for (let i = 0; i < count; i++)
        {
            const param = lists.find((p) => p.field === field && p.index === i);
            const label = param ? `${param.label} (${param.type})${param.required ? "" : ", optional"}` : "value";
            lines.push(`    - value: ${label}`);
        }
    }

    return lines.join("\n");
}

export function markdownDoc(def: TriggerTypeDef, kind: string): vscode.MarkdownString
{
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${def.key}** (${kind})\n\n${def.description}\n\n`);
    md.appendCodeblock(buildUsageText(def, kind), "yaml");
    return md;
}
