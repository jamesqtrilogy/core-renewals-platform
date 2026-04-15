/**
 * GET /api/support-tickets?accountName=Acme+Corp
 *
 * Fetches Kayako support tickets for an account by calling the Anthropic API
 * with the Kayako MCP server. Tries org name first, falls back to keyword search.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ParsedTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  requester: string;
  requesterEmail: string;
  createdAt: string;
  updatedAt: string;
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey });
}

function getMcpUrl(): string {
  const url = process.env.KAYAKO_MCP_URL;
  if (!url) throw new Error("KAYAKO_MCP_URL is not configured");
  return url;
}

function isWithinMonths(dateStr: string, months: number): boolean {
  if (!dateStr) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return new Date(dateStr) >= cutoff;
}

function extractTickets(text: string): ParsedTicket[] {
  const tickets: ParsedTicket[] = [];

  const idPattern = /(?:ticket|case|id)[:\s#]*(\d+)/gi;
  const lines = text.split("\n");

  let current: Partial<ParsedTicket> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const idMatch = trimmed.match(/(?:^|\|)\s*#?(\d{4,})/);
    if (idMatch && !current.id) {
      if (current.id && current.subject) {
        tickets.push(current as ParsedTicket);
      }
      current = {
        id: idMatch[1],
        subject: "",
        status: "unknown",
        priority: "normal",
        requester: "",
        requesterEmail: "",
        createdAt: "",
        updatedAt: "",
      };
    }

    if (/subject|title/i.test(trimmed) && trimmed.includes(":")) {
      current.subject = trimmed.split(":").slice(1).join(":").trim();
    }
    if (/status/i.test(trimmed) && trimmed.includes(":")) {
      current.status = trimmed.split(":").slice(1).join(":").trim().toLowerCase();
    }
    if (/priority/i.test(trimmed) && trimmed.includes(":")) {
      current.priority = trimmed.split(":").slice(1).join(":").trim().toLowerCase();
    }
    if (/requester|reporter|created.by|from/i.test(trimmed) && trimmed.includes(":")) {
      const val = trimmed.split(":").slice(1).join(":").trim();
      if (val.includes("@")) {
        current.requesterEmail = val;
      } else {
        current.requester = val;
      }
    }
    if (/created|opened|date/i.test(trimmed) && !(/updated|modified/i.test(trimmed)) && trimmed.includes(":")) {
      const val = trimmed.split(":").slice(1).join(":").trim();
      if (val && !isNaN(Date.parse(val))) {
        current.createdAt = val;
      }
    }
    if (/updated|modified|last.activity/i.test(trimmed) && trimmed.includes(":")) {
      const val = trimmed.split(":").slice(1).join(":").trim();
      if (val && !isNaN(Date.parse(val))) {
        current.updatedAt = val;
      }
    }

    // Table row format: | id | subject | status | priority | requester | date |
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 3 && /^\d{4,}$/.test(cells[0])) {
        tickets.push({
          id: cells[0],
          subject: cells[1] ?? "",
          status: (cells[2] ?? "unknown").toLowerCase(),
          priority: (cells[3] ?? "normal").toLowerCase(),
          requester: cells[4] ?? "",
          requesterEmail: "",
          createdAt: cells[5] ?? "",
          updatedAt: cells[6] ?? cells[5] ?? "",
        });
        current = {};
        continue;
      }
    }
  }

  if (current.id && current.subject) {
    tickets.push(current as ParsedTicket);
  }

  // Fallback: if parsing found nothing, try to extract from the full text blob
  if (tickets.length === 0) {
    const allIds = [...text.matchAll(idPattern)].map((m) => m[1]);
    for (const tid of [...new Set(allIds)]) {
      tickets.push({
        id: tid,
        subject: "(Could not parse subject)",
        status: "unknown",
        priority: "normal",
        requester: "",
        requesterEmail: "",
        createdAt: "",
        updatedAt: "",
      });
    }
  }

  return tickets;
}

async function searchTickets(
  client: Anthropic,
  mcpUrl: string,
  accountName: string,
  useKeyword: boolean
): Promise<string> {
  const searchInstruction = useKeyword
    ? `Search Kayako for support tickets with keyword "${accountName}". Use the search_tickets tool with query set to "${accountName}" and max_results 20.`
    : `Search Kayako for support tickets for the organization "${accountName}". Use the search_tickets tool with organization_name set to "${accountName}" and max_results 20.`;

  const response = await client.beta.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${searchInstruction}

List all tickets found with their: ticket ID, subject, status, priority, requester name, requester email, created date, and last updated date. Format each ticket clearly.`,
      },
    ],
    mcp_servers: [
      {
        type: "url",
        url: mcpUrl,
        name: "kayako",
      },
    ],
    tools: [
      { type: "mcp_toolset", mcp_server_name: "kayako" } as never,
    ],
    betas: ["mcp-client-2025-11-20"],
  });

  const textParts = response.content
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { type: string; text?: string }) => block.text ?? "");

  return textParts.join("\n");
}

export async function GET(request: NextRequest) {
  try {
    const accountName = request.nextUrl.searchParams.get("accountName");
    if (!accountName) {
      return NextResponse.json({ error: "Missing accountName parameter", tickets: [] }, { status: 400 });
    }

    const client = getAnthropicClient();
    const mcpUrl = getMcpUrl();

    // Try org search first
    let responseText = await searchTickets(client, mcpUrl, accountName, false);
    let tickets = extractTickets(responseText);

    // If no results, retry with keyword search
    if (tickets.length === 0) {
      responseText = await searchTickets(client, mcpUrl, accountName, true);
      tickets = extractTickets(responseText);
    }

    // Filter to last 6 months
    const filtered = tickets.filter((t) => {
      const date = t.createdAt || t.updatedAt;
      if (!date) return true; // keep if no date (don't lose data)
      return isWithinMonths(date, 6);
    });

    return NextResponse.json({ tickets: filtered, raw: responseText });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/api/support-tickets] Error:", message);
    return NextResponse.json({ error: message, tickets: [] }, { status: 500 });
  }
}
