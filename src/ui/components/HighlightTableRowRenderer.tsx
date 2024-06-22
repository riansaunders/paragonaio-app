import { TableRowProps } from "react-virtualized";
import React from "react";
export function HighlightTableRowRenderer({
  key,
  style,
  columns,
}: // This must be passed through to the rendered row element.
TableRowProps) {
  return (
    <span
      key={key}
      style={style}
      className={
        "flex flex-row items-center py-1 ml-0 hover:bg-[#272727] rounded-md hover:bg-opacity-40 border-b border-[#272727]"
      }
    >
      {columns.map((c) => c)}
    </span>
  );
}
