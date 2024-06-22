import React from "react";

export interface LeftSidebarProps {
  children: React.ReactNode;
}

export function SecondaryContainer({ children }: LeftSidebarProps) {
  return (
    <aside className=" ">
      <div className="h-full overflow-hidden overflow-y-auto  flex flex-col w-[16.5rem] max-w-xs  border-r bg-[#0a0a0a] border-[#1a1a1a] order-first p-4">
        {children}
      </div>
    </aside>
  );
}
