import {
  Any,
  DataDome,
  QueueItChallenge,
  ShopifyCheckoutChallenge,
  ShopifyCheckpoint,
  ShopifyLogin,
} from "@core/challenge/Challenge";
import { proxiesToString, proxyToString } from "@core/util/helpers";
import { BasicProxy } from "@entities/BasicProxy";
import { Solver, SolverType } from "@entities/Solver";
import { Dialog, Transition } from "@headlessui/react";
import { DesktopComputerIcon } from "@heroicons/react/outline";
import {
  LoginIcon,
  PencilIcon,
  PuzzleIcon,
  TrashIcon,
} from "@heroicons/react/solid";
import { Layout } from "@ui/components/Layout";
import { PrimaryContainer } from "@ui/components/PrimaryContainer";
import { DialogProps } from "@ui/components/SlideOverProps";
import { useDALRecords } from "@ui/utils/hooks";
import { post } from "@ui/utils/renderer-router";
import { ErrorMessage, Field, Form, Formik } from "formik";
import React, { Fragment, useState } from "react";
import { ReturnModelType, SolverModel } from "src/dal/DAL";
import * as yup from "yup";

type SolverDialogProps = DialogProps & {
  solver: ReturnModelType<typeof Solver>;
};

function SolverDialog({ solver, open, setOpen }: SolverDialogProps) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        auto-reopen="true"
        className="fixed z-10 inset-0 overflow-y-auto"
        onClose={setOpen}
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
            <div className="inline-block align-bottom bg-[#131212] rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <Formik
                initialValues={{
                  name: solver.name,
                  where: solver.where,
                  proxy: solver.proxy ? proxiesToString([solver.proxy]) : "",
                }}
                validationSchema={yup.object().shape({
                  name: yup.string().required(),
                  where: yup.string().required(),
                  proxy: yup.string(),
                })}
                onSubmit={(values, helpers) => {
                  solver.name = values.name;
                  if (values.proxy) {
                    solver.proxy = new BasicProxy();
                    solver.proxy.proxyString = values.proxy;
                  } else {
                    solver.proxy = undefined;
                  }
                  solver.where = values.where;

                  solver.save();

                  setOpen(false);
                }}
              >
                <Form>
                  <div className="w-full text-white">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <div className={"flex justify-between mb-3"}>
                        <Dialog.Title
                          as="h3"
                          className="text-lg leading-6 font-medium text-white"
                        >
                          Edit Solver
                        </Dialog.Title>
                      </div>

                      <div>
                        <label className="block text-sm font-medium">
                          Name
                        </label>
                        <div className="mt-1">
                          <Field
                            name="name"
                            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                          />
                          <ErrorMessage
                            name="name"
                            className={"text-red-500 text-sm"}
                            component={"div"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium">
                          Where
                        </label>
                        <div className="mt-1">
                          <Field
                            name="where"
                            as={"select"}
                            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                          >
                            <option value={Any}>{Any}</option>
                            <option value={ShopifyCheckpoint}>
                              {ShopifyCheckpoint}
                            </option>
                            <option value={ShopifyLogin}>{ShopifyLogin}</option>
                            <option value={ShopifyCheckoutChallenge}>
                              {ShopifyCheckoutChallenge}
                            </option>
                            <option value={DataDome}>{DataDome}</option>
                            <option value={QueueItChallenge}>
                              {QueueItChallenge}
                            </option>
                          </Field>
                          <ErrorMessage
                            name="where"
                            className={"text-red-500 text-sm"}
                            component={"div"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium">
                          Proxy
                        </label>
                        <div className="mt-1">
                          <Field
                            name="proxy"
                            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                          />
                          <ErrorMessage
                            name="proxy"
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
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600 hover:bg-purple-700 text-base font-medium text-white  sm:ml-3 sm:w-auto sm:text-sm"
                      onClick={() => {}}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50  sm:mt-0 sm:w-auto sm:text-sm"
                      onClick={() => setOpen(false)}
                      // ref={cancelButtonRef}
                    >
                      Cancel
                    </button>
                  </div>
                </Form>
              </Formik>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

export function SolversPage() {
  const solvers = useDALRecords<Solver>(SolverModel).filter(
    (s) => s.type === SolverType.Manual
  );
  const [selected, setSelected] = useState<
    ReturnModelType<typeof Solver> | undefined
  >(undefined);
  const [open, setOpen] = useState(false);

  console.log(SolverModel.all());
  return (
    <Layout>
      <PrimaryContainer>
        <h1 className={"text-xl "}> Solvers</h1>
        <h4 className={"text-base opacity-50"}>{solvers.length} solvers</h4>

        <div
          className={
            "grid   grid-cols-2 mt-2 lg:grid-cols-4 gap-3 overflow-y-auto"
          }
        >
          <div>
            <button
              type="button"
              className="w-full  border-2 border-[#202020] border-dashed rounded-lg p-12 text-center hover:border-[#272727] items-center flex flex-col "
              onClick={() => {
                // openFresh();
                SolverModel.create({
                  name: `Solver ${solvers.length + 1}`,
                  type: SolverType.Manual,
                  where: Any,
                }).save();
              }}
            >
              <PuzzleIcon className={" h-8 w-8 self-center font-extralight"} />
              <span className="mt-2 block text-sm  ">Create a new solver </span>
            </button>
          </div>
          {(solvers as ReturnModelType<typeof Solver>[]).map((solver) => (
            <div className="w-full h-[10rem]   bg-[#202020] border-2 border-[#272727]   rounded-md    flex flex-col shadow-md ">
              <div className={"flex flex-grow p-2 flex-col"}>
                <div className={"text-lg truncate"}>{solver.name}</div>
                <div className="truncate pt-2">
                  {/* <div className={"text-xs"}>Where</div> */}
                  <div className={"text-sm truncate"}>
                    <span className={"opacity-50"}>where:</span> {solver.where}
                  </div>
                </div>
                <div className="truncate pt-2">
                  {/* <div className={"text-xs"}>Proxy</div> */}
                  <div className={"text-sm truncate"}>
                    <span className={"opacity-50"}>proxy:</span>{" "}
                    {solver.proxy?.proxyString
                      ? proxyToString(solver.proxy)
                      : "no proxy"}
                  </div>
                </div>
              </div>
              <div className="mt-2   text-sm border-t p-2 border-t-[#272727] flex justify-between  ">
                <button
                  className={
                    "hover:opacity-50 transition-opacity  h-full w-full content-center items-center inline-flex justify-center"
                  }
                  onClick={() => {
                    post("openSolver", { id: solver.id });
                  }}
                >
                  <DesktopComputerIcon className={"h-5 w-5 font-extralight"} />
                </button>
                <button
                  className={
                    "hover:opacity-50 transition-opacity h-full w-full content-center items-center inline-flex justify-center border-l-2 border-[#272727]"
                  }
                  title={"Gmail login"}
                  onClick={() => {
                    post("openURLInSolver", {
                      id: solver.id,
                      url: "https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&flowEntry=ServiceLogin",
                      userAgent: "chrome",
                    });
                  }}
                >
                  <LoginIcon className={"h-5 w-5"} />
                </button>

                <button
                  className={
                    "hover:opacity-50 transition-opacity h-full w-full content-center items-center inline-flex border-l-2 border-r-2 border-[#272727] justify-center"
                  }
                  onClick={() => {
                    setSelected(solver);
                    setOpen(true);
                  }}
                >
                  <PencilIcon className={"h-5 w-5"} />
                </button>
                <button
                  className={
                    "h-full w-full transition-colors content-center items-center inline-flex justify-center text-red-500 hover:text-red-600"
                  }
                  onClick={() => {
                    solver.delete();
                  }}
                >
                  <TrashIcon className={"h-5 w-5 "} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {selected && (
          <SolverDialog solver={selected} open={open} setOpen={setOpen} />
        )}
      </PrimaryContainer>
    </Layout>
  );
}
