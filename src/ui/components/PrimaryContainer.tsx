import React from "react";
// import { app } from "electron";
export interface RightSidebarProps {
  children: React.ReactNode;
}

export function PrimaryContainer({ children }: RightSidebarProps) {
  return (
    <>
      <section
        aria-labelledby="primary-heading"
        className="min-w-0 flex-1 h-full flex flex-col mb-2  bg-[#0a0a0a] order-last p-4 pb-6 "
      >
        <div className={"pt-5"} />
        {children}
      </section>
    </>
  );
}
