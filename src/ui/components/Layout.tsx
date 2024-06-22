import {
  ClipboardIcon,
  CogIcon,
  CreditCardIcon,
  HomeIcon,
  KeyIcon,
  PuzzleIcon,
  WifiIcon,
} from "@heroicons/react/solid";
import React from "react";
import { useRouteMatch } from "react-router";
import { Link } from "react-router-dom";

const navigation = [
  { name: "Home", href: "/", icon: HomeIcon },
  { name: "Tasks", href: "/tasks", icon: ClipboardIcon },
  { name: "Profiles", href: "/profiles", icon: CreditCardIcon },
  { name: "Proxies", href: "/proxies", icon: WifiIcon },
  { name: "Accounts", href: "/accounts", icon: KeyIcon },
  { name: "Solvers", href: "/solvers", icon: PuzzleIcon },
  { name: "Settings", href: "/settings", icon: CogIcon },
];

export type LayoutProps = {
  children: React.ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const { path } = useRouteMatch();
  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden text-white">
      <div className="flex lg:flex-shrink-0">
        <div className="flex flex-col w-16">
          <div className="flex flex-col h-0 flex-1 overflow-y-auto bg-[#0f0f0f]">
            <div className="flex-1 flex flex-col">
              <div
                className="flex-shrink-0  py-4 flex items-center justify-center"
                // @ts-expect-error
                style={{ WebkitAppRegion: "drag" }}
              >
                <img
                  className="h-[50px] w-auto select-none"
                  src="icont.png"
                  alt="logo"
                />
              </div>

              {navigation.map((item, idx) => (
                <div
                  className={" transition-all duration-150 hover:border-purple-600 hover:border-opacity-50 hover:text-opacity-70  border-transparent border-l-[3px] w-full  flex items-center text-center justify-center ".concat(
                    item.href === path
                      ? "border-purple-600 hover:border-opacity-100 hover:text-opacity-100 border-l-[3px] text-white"
                      : "text-[#626365]  hover:text-white"
                  )}
                  key={item.href.concat(String(idx))}
                >
                  <Link
                    to={item.href}
                    className={
                      " p-4 w-full flex items-center text-center justify-center"
                    }
                  >
                    <item.icon className={"h-5 w-5"} />
                  </Link>
                </div>
              ))}
            </div>
            <div
              className={"flex flex-grow"}
              // @ts-expect-error
              style={{ WebkitAppRegion: "drag" }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <main className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex xl:overflow-hidden">{children}</div>
        </main>
      </div>
    </div>
  );
}
