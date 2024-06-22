import { SolverType } from "@entities/Solver";
import { BeakerIcon, FolderOpenIcon } from "@heroicons/react/outline";
import { UploadIcon } from "@heroicons/react/solid";
import { Layout } from "@ui/components/Layout";
import { PrimaryContainer } from "@ui/components/PrimaryContainer";
import { post } from "@ui/utils/renderer-router";
import { ErrorMessage, Field, Form, Formik } from "formik";
import React from "react";
import { SettingsModel, SolverModel } from "src/dal/DAL";

export default function SettingsPage() {
  const settings = SettingsModel.first() ?? SettingsModel.create();

  let twoCap = SolverModel.all().find((s) => s.type === SolverType.TwoCaptcha);
  let capMon = SolverModel.all().find((s) => s.type === SolverType.CapMonster);

  return (
    <Layout>
      <PrimaryContainer>
        <h1 className={"text-xl "}>Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Make the most of your experience
        </p>
        <Formik
          initialValues={{
            discordWebhook: settings?.discordWebhook ?? "",
            postDeclinesToHook: settings?.postDeclinesToHook ?? false,
            postAutomationToHook: settings?.postAutomationToHook ?? false,
            postCartsToHook: settings?.postCartsToHook ?? false,
            autoSolveQueueIt: settings?.autoSolveQueueIt ?? false,
            thirdPartyQueueIt: settings?.thirdPartyQueueIt ?? false,

            declineSound: settings?.declineSound ?? true,

            twocaptchaKey: twoCap?.key ?? "",
            capmonKey: capMon?.key ?? "",

            autoSolveAccessToken: settings?.autoSolveAccessToken ?? "",
            autoSolveApiKey: settings?.autoSolveApiKey ?? "",
          }}
          onSubmit={(values, helpers) => {
            settings.discordWebhook = values.discordWebhook;
            settings.postDeclinesToHook = values.postDeclinesToHook;
            settings.postAutomationToHook = values.postAutomationToHook;
            settings.postCartsToHook = values.postCartsToHook;
            settings.autoSolveQueueIt = values.autoSolveQueueIt;
            settings.autoSolveAccessToken = values.autoSolveAccessToken;
            settings.autoSolveApiKey = values.autoSolveApiKey;
            settings.declineSound = values.declineSound;

            settings.thirdPartyQueueIt = values.thirdPartyQueueIt;

            settings.save();

            twoCap =
              twoCap ??
              SolverModel.create({
                type: SolverType.TwoCaptcha,
              });
            twoCap.key = values.twocaptchaKey;
            twoCap.save();

            capMon =
              capMon ??
              SolverModel.create({
                type: SolverType.CapMonster,
              });
            capMon.key = values.capmonKey;
            capMon.save();
          }}
        >
          {({ values }) => (
            <Form>
              <div className="mt-2 w-full text-white ">
                <div className={"border-b border-b-[#272727] py-4"}>
                  <div className={"grid grid-cols-3 gap-4"}>
                    <div className={"flex content-center "}>Discord</div>
                    <div className={"col-span-2"}>
                      <label className="block text-sm font-medium">
                        Webhook
                      </label>
                      <div className={"grid grid-cols-3 gap-2"}>
                        <div className={"col-span-2"}>
                          <div className="mt-1">
                            <Field
                              name="discordWebhook"
                              className="inline  max-w-lg w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                            />
                            <ErrorMessage
                              name="discordWebhook"
                              className={"text-red-500 text-sm"}
                              component={"div"}
                            />
                          </div>
                          <div className={"mt-3"}>
                            <div className={"inline-flex content-center"}>
                              <Field
                                id="postDeclinesToHook"
                                name="postDeclinesToHook"
                                type={"checkbox"}
                                className="bg-[#1f1f1f] focus:ring-purple-600 focus-visible:ring-transparent h-4 w-4   rounded-md "
                              />
                              <label
                                htmlFor={"postDeclinesToHook"}
                                className="ml-1 text-xs font-medium select-none"
                              >
                                Declines
                              </label>
                            </div>

                            {/* <div className={"inline-flex content-center ml-2"}>
                        <Field
                          id="postCartsToHook"
                          name="postCartsToHook"
                          type={"checkbox"}
                          className="bg-[#1f1f1f] focus:ring-purple-600 focus-visible:ring-transparent h-4 w-4   rounded-md "
                        />
                        <label
                          htmlFor={"postCartsToHook"}
                          className="ml-1 text-xs font-medium select-none"
                        >
                          Carts
                        </label>
                      </div> */}
                            <div className={"inline-flex content-center ml-2"}>
                              <Field
                                id="postAutomationToHook"
                                name="postAutomationToHook"
                                type={"checkbox"}
                                className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                              />

                              <label
                                htmlFor={"postAutomationToHook"}
                                className="ml-1 text-xs font-medium select-none"
                              >
                                Automation
                              </label>
                            </div>
                          </div>
                        </div>
                        <div className={"mt-1.5 content-center"}>
                          <button
                            type="button"
                            className={"ml-2 inline-flex items-center px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-[#272727]   ".concat(
                              !values.discordWebhook
                                ? "cursor-not-allowed"
                                : "hover:bg-[#202020] "
                            )}
                            disabled={!values.discordWebhook}
                            onClick={() => {
                              post("testWebhook", {
                                webhook: values.discordWebhook,
                              });
                            }}
                          >
                            <BeakerIcon
                              className=" mr-2 h-5 w-5"
                              aria-hidden="true"
                            />
                            Test webhook
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={"border-b border-b-[#272727] py-4"}>
                  <div className={"grid grid-cols-3 gap-4"}>
                    <div>Third Party Solvers</div>
                    <div className={"grid grid-cols-2 gap-2 col-span-2"}>
                      <div>
                        <label className="block text-sm font-medium">
                          2Captcha Key
                        </label>
                        <div className="mt-1">
                          <Field
                            name="twocaptchaKey"
                            className="block w-full max-w-lg shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                          />
                          <ErrorMessage
                            name="twocaptchaKey"
                            className={"text-red-500 text-sm"}
                            component={"div"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium">
                          CapMonster Key
                        </label>
                        <div className="mt-1">
                          <Field
                            name="capmonKey"
                            className="block w-full max-w-lg shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                          />
                          <ErrorMessage
                            name="capmonKey"
                            className={"text-red-500 text-sm"}
                            component={"div"}
                          />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className={"inline-flex content-center"}>
                          <Field
                            id="thirdPartyQueueIt"
                            name="thirdPartyQueueIt"
                            type={"checkbox"}
                            className="bg-[#1f1f1f] focus:ring-purple-600 focus-visible:ring-transparent h-4 w-4   rounded-md "
                          />
                          <label
                            htmlFor={"thirdPartyQueueIt"}
                            className="ml-1 text-xs font-medium select-none"
                          >
                            Queue-It
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={"border-b border-b-[#272727] py-4"}>
                  <div className={"grid grid-cols-3 gap-4"}>
                    <div>Autosolve</div>
                    <div className={"grid grid-cols-2 gap-2 col-span-2"}>
                      <div>
                        <label className="block text-sm font-medium">
                          Access Token
                        </label>
                        <div className="mt-1">
                          <Field
                            name="autoSolveAccessToken"
                            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                          />
                          <ErrorMessage
                            name="autoSolveAccessToken"
                            className={"text-red-500 text-sm"}
                            component={"div"}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium">
                          Api Key
                        </label>
                        <div className="mt-1">
                          <Field
                            name="autoSolveApiKey"
                            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                          />
                          <ErrorMessage
                            name="autoSolveApiKey"
                            className={"text-red-500 text-sm"}
                            component={"div"}
                          />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className={"inline-flex content-center"}>
                          <Field
                            id="autoSolveQueueIt"
                            name="autoSolveQueueIt"
                            type={"checkbox"}
                            className="bg-[#1f1f1f] focus:ring-purple-600 focus-visible:ring-transparent h-4 w-4   rounded-md "
                          />
                          <label
                            htmlFor={"autoSolveQueueIt"}
                            className="ml-1 text-xs font-medium select-none"
                          >
                            Queue-It
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={"border-b border-b-[#272727] py-4"}>
                  <div className={"grid grid-cols-3 gap-4"}>
                    <div>Logs</div>
                    <div
                      className={
                        "grid grid-cols-2 gap-2 col-span-2 items-center"
                      }
                    >
                      <div className={"col-span-2"}>
                        <button
                          type="button"
                          className="inline-flex items-center px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-black   bg-white hover:bg-gray-200  "
                          onClick={() => {
                            post("openLogFolder");
                          }}
                        >
                          <FolderOpenIcon
                            className=" mr-2 h-5 w-5"
                            aria-hidden="true"
                          />
                          Open Log Folder
                        </button>
                        <button
                          type="button"
                          className="ml-2 inline-flex items-center px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-[#272727] hover:bg-[#202020]  "
                          onClick={() => {
                            post("openExportLogs");
                          }}
                        >
                          <UploadIcon
                            className=" mr-2 h-5 w-5"
                            aria-hidden="true"
                          />
                          Export Logs
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={"border-b border-b-[#272727] py-4"}>
                  <div className={"grid grid-cols-3 gap-4"}>
                    <div>Sounds</div>
                    <div
                      className={
                        "grid grid-cols-2 gap-2 col-span-2 items-center"
                      }
                    >
                      <div className={"col-span-2"}>
                        <div className={"inline-flex content-center"}>
                          <Field
                            id="declineSound"
                            name="declineSound"
                            type={"checkbox"}
                            className="bg-[#1f1f1f] focus:ring-purple-600 focus-visible:ring-transparent h-4 w-4   rounded-md "
                          />
                          <label
                            htmlFor={"declineSound"}
                            className="ml-1 text-xs font-medium select-none"
                          >
                            Decline
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={"flex justify-end mt-2"}>
                <button
                  type="submit"
                  className="uppercase  ml-2 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 "
                >
                  Save
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </PrimaryContainer>
    </Layout>
  );
}
