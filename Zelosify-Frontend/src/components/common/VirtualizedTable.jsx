"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/UI/shadcn/table";

/**
 * VirtualizedTable — renders large lists (>50 rows) with windowed rendering
 * so the DOM stays small and the UI never freezes. Falls back to plain rows
 * for small lists to avoid unnecessary overhead.
 */
export default function VirtualizedTable({
  rows,
  columns,
  rowKey,
  estimateSize = 53,
  overscan = 10,
  onRowClick,
  className = "",
}) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // Small lists: render directly (no windowing overhead).
  if (rows.length <= 50) {
    return (
      <div className={`border border-border rounded-lg overflow-hidden ${className}`}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className="px-4 py-3">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row[rowKey]}
                className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className="px-4 py-3 text-sm text-foreground">
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`border border-border rounded-lg overflow-auto ${className}`}
      style={{ height: Math.min(600, rows.length * estimateSize) }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className="px-4 py-3">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <TableRow
                  key={row[rowKey]}
                  data-index={virtualRow.index}
                  ref={(node) => virtualizer.measureElement(node)}
                  className={`absolute w-full ${onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className="px-4 py-3 text-sm text-foreground">
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
