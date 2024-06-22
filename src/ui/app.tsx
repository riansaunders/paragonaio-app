import "reflect-metadata";

import { serialize } from "@core/util/serial";
import { BuyerTask } from "@entities/BuyerTask";
import { MonitorTask } from "@entities/MonitorTask";
import { Profile } from "@entities/Profile";
import { Dialog, Transition } from "@headlessui/react";
import { MinusSmIcon, XIcon } from "@heroicons/react/outline";

import { ipcRenderer } from "electron";
import { ErrorMessage, Field, Form, Formik } from "formik";
import React, { Fragment, useEffect, useState } from "react";
import { HashRouter, Route, Switch } from "react-router-dom";
import {
  getLoadedModels,
  ProfileGroupModel,
  TaskGroupModel,
} from "src/dal/DAL";
import * as yup from "yup";
import AccountsPage from "./pages/Accounts";
import Dashboard from "./pages/Dashboard";
import ProfilesPage from "./pages/Profiles";
import ProxiesPage from "./pages/Proxies";
import SettingsPage from "./pages/Settings";
import { SolverHome } from "./pages/SolverHome";
import { SolversPage } from "./pages/Solvers";
import TasksPage from "./pages/Tasks";
import "./styles.css";
import { get, post } from "./utils/renderer-router";
import { SignInResult } from "@entities/SignInResult";

class ErrorBoundary extends React.Component {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    console.error(error);
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error(error);
  }

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}

// my key:
//1beb6e33-b52b-4ded-a1fc-f36346657e9d

export default function App() {
  const key = localStorage.getItem("key");
  const [version, setVersion] = useState("");
  const [loading, setLoading] = useState(!!key ? true : false);
  const [signedIn, setSignedIn] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number>(0);

  const signIn = async (key: string) => {
    return post(
      "signIn",
      {
        key: key,
      },
      (r: SignInResult) => {
        if (r.success) {
          localStorage.setItem("key", key);
        }
        setLoading(false);
        return r;
      }
    ) as SignInResult;
  };

  useEffect(() => {
    const updateProgressListener = (_: any, res: any) => {
      if (Number(res) > updateProgress) {
        setUpdateProgress(Math.round(res));
      }
    };
    ipcRenderer.on("updateDownloadProgress", updateProgressListener);
  }, []);

  useEffect(() => {
    ipcRenderer.on("signOut", () => {
      setSignedIn(false);
    });
    ipcRenderer.on("signIn", () => {
      setSignedIn(true);
      console.log(signedIn, loading, "signIn");
    });
    ipcRenderer.on("updateReady", () => {
      setUpdating(true);
    });
  }, []);

  useEffect(() => {
    if (key) {
      signIn(key);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    for (let model of getLoadedModels()) {
      model["save"] = async (r) => {
        // optimistically say we did what we did
        model._addOrReplace(r);
        model.emit("save", r);

        const event = "save_" + model.name;

        console.time("convert");
        const body = serialize(r, true);
        console.timeEnd("convert");

        console.time("send");
        // this is the actual save part
        post(event, body);
        console.timeEnd("send");
      };

      model["rearrange"] = (source, destination) => {
        const event = "rearrange_" + model.name;

        model._rearrange(source, destination);
        model.emit("rearrange", source, destination);

        post(event, {
          source: source,
          destination: destination,
        });
      };

      model["remove"] = async (r) => {
        model._remove(r);
        model.emit("remove", r);

        const event = "remove_" + model.name;

        // this is the actual remove part
        post(event, {
          id: r.id,
        });
      };

      ipcRenderer.on(`update_${model.name}`, (_, m) => {
        try {
          if (m?.id) {
            model.replaceOrCreate(m.id, m);
          }
        } catch (err) {
          console.error(err);
        }
      });
    }
  }, []);

  useEffect(() => {
    ipcRenderer.on(
      "updateGroup",
      async (
        _,
        data: {
          group: string;
          buyers: Partial<BuyerTask>[];
          monitors: Partial<MonitorTask>[];
        }
      ) => {
        const g = TaskGroupModel.findById(data.group);
        if (g) {
          for (let buyer of data.buyers) {
            const taskIdx = g.buyers.findIndex((b) => b.id === buyer.id);
            if (taskIdx !== -1) {
              g.buyers[taskIdx] = Object.assign(g.buyers[taskIdx], buyer);
            }
          }
          for (let monitor of data.monitors) {
            const taskIdx = g.monitors.findIndex((b) => b.id === monitor.id);
            if (taskIdx !== -1) {
              g.monitors[taskIdx] = Object.assign(g.monitors[taskIdx], monitor);
            }
          }
        }
      }
    );
  }, []);

  useEffect(() => {
    ipcRenderer.on(
      "addProfilesToGroup",
      (
        _,
        data: {
          group: string;
          profiles: Profile[];
        }
      ) => {
        const pg = ProfileGroupModel.findById(data.group);
        if (!pg) {
          return;
        }
        // @ts-ignore
        data.profiles = data.profiles.map((p) => {
          return Profile.create<Profile>({
            ...p,
            profileGroup: pg,
          });
        });

        pg.profiles.push(...data.profiles);
        pg.save();
      }
    );
  }, []);

  useEffect(() => {
    ipcRenderer.on("playSound", (_, body) => {
      try {
        const volume: number = Math.min(body.volume ?? 1, 1);
        const file = body.file;
        const sound = new Audio(file);
        sound.volume = volume;
        sound.play();
      } catch (e) {
        console.error(e);
      }
    });
  }, []);

  useEffect(() => {
    get("version").then((v: any) => {
      setVersion(v.version);
    });
  }, []);

  const isSolverPage =
    location.href.endsWith("#/solver") || location.href.endsWith("#solver");

  if (isSolverPage) {
    return (
      <>
        <ErrorBoundary>
          <SolverHome />
        </ErrorBoundary>
      </>
    );
  }
  if (!signedIn || updating) {
    return (
      <>
        <div
          className={
            "h-screen w-screen bg-[#0a0a0a] flex flex-col justify-center items-center text-white"
          }
        >
          <div
            className={
              " animate-pulse flex flex-col justify-center items-center"
            }
          >
            <img className="h-[126px] w-auto select-none" src="icont.png" />
            {loading && !updating && (
              <h1 className={"text-xs"}>Signing in...</h1>
            )}
            {updating && (
              <h1 className={"text-xs"}>
                Downloading Update: {updateProgress}%
              </h1>
            )}
            {updateProgress >= 100 && (
              <button
                onClick={() => post("installUpdates")}
                className="mt-2 px-3 py-1.5 shadow-sm max-h-8  bg-white hover:bg-gray-100 text-black text-xs  rounded-md flex items-center "
              >
                Install Update
              </button>
            )}
          </div>
        </div>
        <Transition.Root
          show={!loading && !signedIn && !updating}
          as={Fragment}
        >
          <Dialog
            as="div"
            auto-reopen="true"
            className="fixed z-10 inset-0 overflow-y-auto"
            onClose={() => {}}
          >
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              {/* This element is to trick the browser into centering the modal contents. */}
              <span
                className="hidden sm:inline-block sm:align-middle sm:h-screen"
                aria-hidden="true"
              >
                &#8203;
              </span>
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <div className="inline-block align-bottom bg-[#131212] rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full sm:p-6">
                  <Formik
                    initialValues={{
                      key: key ?? "",
                    }}
                    validationSchema={yup.object().shape({
                      key: yup.string().required("Enter your license key"),
                    })}
                    onSubmit={(values, helpers) => {
                      signIn(values.key)
                        .then((r) => {
                          if (r.error) {
                            helpers.setFieldError("key", r.error);
                          }
                        })
                        .finally(() => {
                          helpers.setSubmitting(false);
                        });
                    }}
                  >
                    {({ isSubmitting }) => (
                      <Form className={"overflow-hidden"}>
                        <div className="w-full">
                          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                            <div className={"flex justify-between"}></div>
                            <div className="mt-2 w-full text-white">
                              <div>
                                <label className="block text-sm font-medium">
                                  License
                                </label>
                                <div className="mt-1">
                                  <Field
                                    name="key"
                                    className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                                  />
                                  <ErrorMessage
                                    name="key"
                                    className={"text-red-500 text-sm"}
                                    component={"div"}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                            <button
                              type="submit"
                              className={"w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600  text-base font-medium text-white  sm:ml-3 sm:w-auto sm:text-sm ".concat(
                                !isSubmitting ? "hover:bg-purple-700" : ""
                              )}
                              disabled={isSubmitting}
                            >
                              Sign In
                            </button>
                          </div>
                        </div>
                      </Form>
                    )}
                  </Formik>
                </div>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>
      </>
    );
  }

  return (
    <>
      <ErrorBoundary>
        {!isSolverPage && (
          <div
            className={
              "fixed right-[18px] w-100 inline top-[7px] text-white   "
            }
          >
            <span className={"text-xs mr-2"}>v{version && version}</span>

            <button
              className={"hover:opacity-50"}
              onClick={() => post("minimize")}
            >
              <MinusSmIcon className={"w-4 h-4 inline"} />
            </button>

            <button onClick={() => post("quit")}>
              <XIcon className={"w-3 h-3 inline hover:opacity-50"} />
            </button>
          </div>
        )}

        <HashRouter>
          <Switch>
            <Route path={"/tasks"} component={TasksPage} />
            <Route path={"/solvers"} component={SolversPage} />
            <Route path={"/proxies"} component={ProxiesPage} />
            <Route path={"/profiles"} component={ProfilesPage} />
            <Route path={"/accounts"} component={AccountsPage} />
            <Route path={"/settings"} component={SettingsPage} />
            <Route path={"/"} component={Dashboard} />
          </Switch>
        </HashRouter>
      </ErrorBoundary>
    </>
  );
}
