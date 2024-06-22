import { formatProductURL, normalizeUrl } from "@core/util/helpers";
import { generateID } from "@core/util/serial";
import { stores } from "@core/util/stores";
import { BuyerTask } from "@entities/BuyerTask";
import { MessageType } from "@entities/MessageType";
import { MonitorTask } from "@entities/MonitorTask";
import { Platform } from "@entities/Store";
import { Task } from "@entities/Task";
import { TaskGroup } from "@entities/TaskGroup";
import { Dialog, Switch, Transition } from "@headlessui/react";
import { FolderAddIcon } from "@heroicons/react/outline";
import {
  CheckIcon,
  DuplicateIcon,
  ExclamationIcon,
  FolderIcon,
  LinkIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  RssIcon,
  SearchIcon,
  ShoppingCartIcon,
  StopIcon,
  TrashIcon,
  XIcon,
} from "@heroicons/react/solid";
import { HighlightTableRowRenderer } from "@ui/components/HighlightTableRowRenderer";
import { Layout } from "@ui/components/Layout";
import { PrimaryContainer } from "@ui/components/PrimaryContainer";
import { SecondaryContainer } from "@ui/components/SecondayContainer";
import { BuyerForm, BuyerFormAdvanced } from "@ui/forms/BuyerForm";
import { TaskGroupForm } from "@ui/forms/TaskGroupForm";
import { useDALRecords } from "@ui/utils/hooks";
import { post } from "@ui/utils/renderer-router";
import { ipcRenderer } from "electron";
import { ErrorMessage, Field, Form, Formik, useFormikContext } from "formik";
import React, { Fragment, useEffect, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";
import { ContextMenu, ContextMenuTrigger, MenuItem } from "react-contextmenu";
import {
  AutoSizer,
  Column,
  Table,
  TableCellProps,
  TableRowProps,
} from "react-virtualized";
import {
  AccountGroupModel,
  AutomationModel,
  ProfileGroupModel,
  ProxyGroupModel,
  ReturnModelType,
  TaskGroupModel,
} from "src/dal/DAL";
import * as yup from "yup";
import { DialogProps } from "../components/SlideOverProps";

function deleteBuyers(group: ReturnModelType<typeof TaskGroup>, ids: string[]) {
  post("deleteBuyers", {
    group: group.id,
    ids: ids,
  });
  group.buyers = group.buyers.filter((p) => !ids.includes(p.id));

  TaskGroupModel.emit("save", group);
}

function startBuyers(group: ReturnModelType<typeof TaskGroup>, ids: string[]) {
  post("startBuyers", {
    group: group.id,
    ids: ids,
  });
  const dbs = group.buyers.filter((b) => ids.includes(b.id));
  const monitors = new Set<string>();
  const ts: MonitorTask[] = [];
  const added: MonitorTask[] = [];
  for (let task of dbs) {
    task.message = {
      message: "Starting",
      type: MessageType.Info,
    };
    task.isRunning = true;
    monitors.add(task.monitor);
  }

  const mvs = Array.from(monitors);
  for (let monitor of mvs) {
    const existing = group.monitors.find((m) => m.monitor === monitor);
    if (!existing) {
      const task = group.buyers.find((b) => b.monitor === monitor);
      if (task) {
        const monitor = MonitorTask.create<MonitorTask>({
          group: group,
          proxyGroup: task.proxyGroup,
          delay: 3500,
          monitor: task.monitor,
        });
        group.addMonitor(monitor);
        added.push(monitor);
      }
    }
  }

  const mts: string[] = [];
  const ms = group.monitors.filter((m) => mvs.includes(m.monitor));

  for (let monitor of ms.filter((m) => !m.isRunning)) {
    const runningMonitor = ms.find(
      (m) => m.monitor === monitor.monitor && m.isRunning
    );
    if (runningMonitor) {
      continue;
    }

    if (!mts.includes(monitor.monitor)) {
      mts.push(monitor.monitor);
      ts.push(monitor);
    }
  }
  if (added.length) {
    group.save();
  }

  startMonitors(
    group.id,
    ts.map((m) => m.id)
  );
}
function stopBuyers(group: ReturnModelType<typeof TaskGroup>, ids: string[]) {
  post("stopBuyers", {
    ids: ids,
  });
  const dbs = group.buyers.filter((b) => ids.includes(b.id));
  for (let task of dbs) {
    task.message =
      task.exitStatus || task.message?.type === MessageType.Error
        ? task.message
        : undefined;
    task.isRunning = false;
  }
  TaskGroupModel.emit("save", group);
}

function startMonitors(groupId: string, ids: string[]) {
  post("startMonitors", {
    group: groupId,
    ids: ids,
  });
}
function stopMonitors(ids: string[]) {
  post("stopMonitors", {
    ids: ids,
  });
}

type SidebarProps = {
  selectedId?: string;
  taskGroups?: ReturnModelType<typeof TaskGroup>[];
  onSelectionClicked?: (id: string) => void;
};

type TaskGroupCardProps = {
  taskGroup: ReturnModelType<typeof TaskGroup>;
  selected?: boolean;
  onSelectionClicked?: (id: string) => void;
  openEdit: (tg: TaskGroup) => void;
};

function TaskGroupCard({
  taskGroup,
  selected,
  onSelectionClicked,
  openEdit,
}: TaskGroupCardProps) {
  const getTG = () => TaskGroupModel.findById(taskGroup.id)!;
  const [tg, setTg] = useState(getTG());

  useEffect(() => {
    const listener = () => {
      const ng = TaskGroupModel.findById(tg.id);
      // cheap hack to make sure that the component re-renders
      // @ts-expect-error
      setTg(() => {
        return { ...getTG() };
      });
    };
    const evt = `updateTaskGroup_${taskGroup.id}`;

    ipcRenderer.on(evt, listener);

    return () => {
      ipcRenderer.removeListener(evt, listener);
    };
  }, []);

  useEffect(() => {
    // cheap hack to make sure that the component re-renders
    // @ts-expect-error
    setTg(() => {
      return { ...taskGroup };
    });
  }, [taskGroup.name, taskGroup.buyers, taskGroup.monitors, taskGroup.store]);

  return (
    <>
      <ContextMenuTrigger id={`tgc-${tg.id}`} holdToDisplay={-1}>
        <div
          className={"rounded-md   px-3 py-2  border mb-3  cursor-pointer transition-all ".concat(
            selected
              ? "border-[#272727] shadow-md  bg-[#1f1f1f] bg-opacity-50"
              : // ? "border-purple-600 shadow-md"
                "border-[#272727] hover:border-purple-600 hover:border-opacity-50 select-none "
          )}
          onClick={(e) => {
            if (onSelectionClicked) {
              onSelectionClicked(tg.id);
            }
            if (selected) {
              openEdit(tg);
            }
          }}
        >
          <div className={"flex align-center flex-row truncate"}>
            <FolderIcon className={"h-6 w-6 m-2 text-gray-600 inline"} />
            <div className={"truncate"}>
              <span className={"truncate"}>{tg.name}</span>
              <div className={"text-sm font-medium text-white opacity-50"}>
                {tg.store?.name}
              </div>
            </div>
          </div>

          {!tg.monitors.find((t) => t.isRunning) && (
            <div
              className={
                "flex flex-row mt-1 items-center place-items-center text-yellow-600 "
              }
            >
              <ExclamationIcon className={"h-4 w-4 mr-1  "} />
              <span className={"text-xs opacity-80"}>Not Monitoring</span>
            </div>
          )}
          <div className={"text-xs mt-3 select-none"}>
            <div className={"flex flex-row grid-cols gap-1"}>
              <div
                className={
                  "bg-gray-600 text-gray-500 text-opacity-80 bg-opacity-20 py-0.5 text-xs px-1  rounded inline-flex items-center justify-center align-center"
                }
              >
                <SearchIcon className={"h-3 w-3 mr-1 "} />
                <span className={"text-[0.65rem]"}>
                  {tg.monitors.filter((t) => t.isRunning).length}
                </span>
              </div>
              <div
                className={
                  "bg-purple-600 text-purple-500 text-opacity-80  bg-opacity-10 py-0.5 text-xs px-1  rounded inline-flex items-center justify-center align-center"
                }
              >
                {/* <RefreshIcon className={"h-3 w-3 mr-1 "} /> */}

                <svg
                  className={"mr-2 h-3 w-3 ".concat(
                    tg.buyers.filter((t) => t.isRunning).length
                      ? "animate-spin"
                      : ""
                  )}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>

                <span className={"text-[0.65rem]"}>
                  {tg.buyers.filter((t) => t.isRunning).length}
                </span>
              </div>
              <div
                className={
                  "bg-green-600 text-green-500 text-opacity-80  bg-opacity-10 py-0.5 text-xs px-1  rounded inline-flex items-center justify-center align-center"
                }
              >
                <CheckIcon className={"h-3 w-3 mr-1 "} />
                <span className={"text-[0.65rem]"}>
                  {tg.buyers.filter((t) => t.exitStatus === "checkout").length}
                </span>
              </div>
              <div
                className={
                  "bg-yellow-600 text-yellow-500 text-opacity-80  bg-opacity-10 py-0.5 text-xs px-1 rounded inline-flex items-center justify-center align-center"
                }
              >
                <ShoppingCartIcon className={"h-2 w-2 mr-1 "} />
                <span className={"text-[0.65rem]"}>
                  {
                    tg.buyers.filter(
                      (t) => t.product && !t.exitStatus && t.isRunning
                    ).length
                  }
                </span>
              </div>
              <div
                className={
                  "bg-red-600 text-red-500 text-opacity-80  bg-opacity-10 py-0.5 text-xs px-1  rounded inline-flex items-center justify-center align-center"
                }
              >
                <XIcon className={"h-3 w-3 mr-1 "} />
                <span className={"text-[0.65rem]"}>
                  {tg.buyers.filter((t) => t.exitStatus === "decline").length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenu
        id={`tgc-${tg.id}`}
        className={
          "p-2 shadow-lg rounded-md z-50 bg-[#1f1f1f] border border-[#2e2e2e]"
        }
      >
        <MenuItem
          onClick={(e) => {
            startBuyers(
              tg,
              tg.buyers.filter((b) => !b.isRunning).map((b) => b.id)
            );
            startMonitors(
              tg.id,
              tg.monitors.filter((b) => !b.isRunning).map((b) => b.id)
            );
          }}
          className={
            "select-none cursor-pointer hover:bg-[#373737] text-sm py-1 px-2 rounded-md"
          }
        >
          <div className={"inline-flex items-center"}>
            <PlayIcon className={"h-4 w-4 mr-2"} />
            Start Tasks and Monitors
          </div>
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            stopBuyers(
              tg,
              tg.buyers.filter((b) => b.isRunning).map((b) => b.id)
            );
            stopMonitors(
              tg.monitors.filter((b) => b.isRunning).map((b) => b.id)
            );
          }}
          className={
            "select-none cursor-pointer hover:bg-[#373737] text-sm py-1 px-2 rounded-md"
          }
        >
          <div className={"inline-flex items-center"}>
            <StopIcon className={"h-4 w-4 mr-2"} />
            Stop Tasks and Monitors
          </div>
        </MenuItem>
        <MenuItem divider className={"h-[1px] bg-[#2e2e2e] my-1"} />

        <MenuItem
          onClick={(e) => {
            openEdit(tg);
          }}
          className={
            "select-none cursor-pointer hover:bg-[#373737] text-sm py-1 px-2 rounded-md"
          }
        >
          <div className={"inline-flex items-center"}>
            <PencilIcon className={"h-4 w-4 mr-2"} />
            Edit
          </div>
        </MenuItem>
        <MenuItem divider className={"h-[1px] bg-[#2e2e2e] my-1"} />
        <MenuItem
          data={{ foo: "bar" }}
          onClick={(e) => {
            stopBuyers(
              tg,
              tg.buyers.filter((b) => b.isRunning).map((b) => b.id)
            );
            stopMonitors(
              tg.monitors.filter((b) => b.isRunning).map((b) => b.id)
            );
            tg.delete();
          }}
          className={
            "select-none cursor-pointer hover:bg-[#373737] text-sm py-1 px-2 rounded-md"
          }
        >
          <div className={"inline-flex items-center"}>
            <TrashIcon className={"h-4 w-4 mr-2"} />
            Delete
          </div>
        </MenuItem>
      </ContextMenu>
    </>
  );
}

function TasksSidebar({
  taskGroups,
  selectedId,
  onSelectionClicked,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TaskGroup | undefined>(undefined);
  const [automationOpen, setAutomationOpen] = useState(false);

  const openFresh = () => {
    setSelected(undefined);
    setOpen(true);
  };

  const openEdit = (selected?: TaskGroup) => {
    setSelected(selected);
    setOpen(true);
  };

  return (
    <>
      <div className={"uppercase font-medium pb-2 text-sm text-opacity-30"}>
        Task groups
        <button
          className={"ml-2 p-1 h-5 w-5 rounded-md uppercase text-xs text-black bg-gray-200 opacity-100 cursor-pointer ".concat(
            !taskGroups?.length ? "hidden" : ""
          )}
          onClick={() => openFresh()}
        >
          <PlusIcon className={"h-full w-full cursor-pointer"} />
        </button>
        <button
          className={"ml-1 p-1 h-5 w-5 rounded-md uppercase text-xs text-black bg-gray-200 opacity-100 cursor-pointer ".concat(
            !taskGroups?.length ? "hidden" : ""
          )}
          onClick={() => {
            setAutomationOpen(true);
          }}
        >
          <RssIcon className={"h-full w-full cursor-pointer"} />
        </button>
      </div>
      {!taskGroups?.length && (
        <div
          className={"flex align-center justify-center items-center flex-grow"}
        >
          <button
            type="button"
            className="  border-2 border-gray-300 border-dashed rounded-lg p-12 text-center hover:border-gray-400 items-center flex flex-col "
            onClick={() => {
              openFresh();
            }}
          >
            <FolderAddIcon className={"w-8 h-8 self-center font-extralight"} />
            <span className="mt-2 block text-sm  ">
              Create a new task group
            </span>
          </button>
        </div>
      )}

      {/* {!!taskGroups?.length && (
        <div className={"h-full overflow-hidden overflow-y-auto w-full"}>
          {taskGroups?.map((tg) => (
            <TaskGroupCard
              taskGroup={tg}
              selected={selectedId === tg.id}
              onSelectionClicked={onSelectionClicked}
              openEdit={openEdit}
            />
          ))}
        </div>
      )} */}
      <div className={"h-full overflow-hidden overflow-y-auto w-full"}>
        <DragDropContext
          onDragEnd={(r) => {
            if (!r.destination || !taskGroups) {
              return;
            }
            const items = Array.from(taskGroups);
            const [reorderedItem] = items.splice(r.source.index, 1);
            items.splice(r.destination.index, 0, reorderedItem);

            TaskGroupModel.rearrange(r.source.index, r.destination.index);
          }}
        >
          <Droppable droppableId={"taskGroups"}>
            {(provided) => (
              <div
                className="characters"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {!!taskGroups &&
                  taskGroups.map((tg, index) => {
                    return (
                      <Draggable key={tg.id} draggableId={tg.id} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <TaskGroupCard
                              taskGroup={tg}
                              selected={selectedId === tg.id}
                              onSelectionClicked={onSelectionClicked}
                              openEdit={openEdit}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* 
      {!!taskGroups?.length && (
        <div className={"h-full overflow-hidden overflow-y-auto w-full"}>
          {taskGroups?.map((tg) => (
            <TaskGroupCard
              taskGroup={tg}
              selected={selectedId === tg.id}
              onSelectionClicked={onSelectionClicked}
              openEdit={openEdit}
            />
          ))}
        </div>
      )} */}
      <TaskGroupSlideover open={open} taskGroup={selected} setOpen={setOpen} />
      <AutomationSlideover open={automationOpen} setOpen={setAutomationOpen} />
    </>
  );
}

function AutomationSlideover({ open, setOpen }: DialogProps) {
  let automation = AutomationModel.first();
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        auto-reopen="true"
        className="fixed inset-0 overflow-hidden text-white"
        onClose={setOpen}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
            <Transition.Child
              as={Fragment}
              enter="transform transition ease-in-out duration-500 "
              enterFrom="translate-x-full"
              enterTo="translate-x-0"
              leave="transform transition ease-in-out duration-500 "
              leaveFrom="translate-x-0"
              leaveTo="translate-x-full"
            >
              <div className="w-screen max-w-md">
                <div className="h-full flex flex-col py-6 bg-[#131212] shadow-xl overflow-y-scroll">
                  <div className="px-4 sm:px-6">
                    <div className="flex items-start justify-between">
                      <Dialog.Title className="text-lg font-medium ">
                        Automation
                      </Dialog.Title>
                      <div className="ml-3 h-7 flex items-center">
                        <button
                          className="  text-white rounded-md hover:text-opacity-50 focus:outline-none  "
                          onClick={() => setOpen(false)}
                        >
                          <XIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* <div className={"space-y-6"}> */}
                  <Formik
                    initialValues={{
                      monitors: automation?.monitors.join("\n") ?? "",
                      runtime: automation?.runtime || 15,
                      monitorStartEnabled:
                        automation?.monitorStartEnabled ?? false,
                    }}
                    validationSchema={yup.object().shape({
                      monitors: yup.string(),
                      runtime: yup.number().positive().round("ceil").required(),
                      monitorStartEnabled: yup.boolean(),
                    })}
                    onSubmit={(values, helpers) => {
                      const monitors = values.monitors
                        .split("\n")
                        .map((s) => formatProductURL(s.trim()))
                        .filter((s) => s.length);
                      if (!automation) {
                        automation = AutomationModel.create();
                      }
                      automation.monitors = monitors;
                      automation.monitorStartEnabled =
                        values.monitorStartEnabled;
                      automation.runtime = values.runtime;
                      automation.save();

                      // helpers.setFieldValue("monitors", monitors.join("\n"));
                      helpers.setSubmitting(false);
                      setOpen(false);
                    }}
                  >
                    {({ values, setFieldValue }) => (
                      <Form className={"h-full flex flex-col  "}>
                        <div className="mt-3 relative flex-1 px-4 sm:px-6  ">
                          <div className={"flex flex-grow h-full flex-col"}>
                            <label className="block text-sm font-medium    ">
                              SKU | Link | Keywords | Variant (group only)
                            </label>
                            <div className="mt-1 flex flex-grow">
                              <Field
                                name="monitors"
                                as={"textarea"}
                                className="block flex-grow resize-none shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                              />
                              <ErrorMessage
                                name="monitors"
                                className={"text-red-500 text-sm"}
                                component={"div"}
                              />
                            </div>
                            <div className="mt-3 w-full relative text-white">
                              <div>
                                <label className="block text-sm font-medium">
                                  Runtime
                                </label>
                                <div className="mt-1">
                                  <Field
                                    type="number"
                                    name="runtime"
                                    className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                                  />
                                  <div className="absolute inset-y-0 right-0 pr-3 mt-6 flex items-center pointer-events-none">
                                    <span
                                      className="text-gray-400 sm:text-sm"
                                      id="price-currency"
                                    >
                                      minutes
                                    </span>
                                  </div>
                                  <ErrorMessage
                                    name="name"
                                    className={"text-red-500 text-sm"}
                                    component={"div"}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className={"mt-3"}>
                              <Switch.Group
                                as="div"
                                className="flex items-center"
                              >
                                <Switch
                                  checked={values.monitorStartEnabled}
                                  onChange={(v) => {
                                    setFieldValue("monitorStartEnabled", v);
                                  }}
                                  className={"relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200  ".concat(
                                    values.monitorStartEnabled
                                      ? "bg-purple-600"
                                      : "bg-[#1e1e1e]"
                                  )}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={"pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ".concat(
                                      values.monitorStartEnabled
                                        ? "translate-x-5"
                                        : "translate-x-0"
                                    )}
                                  />
                                </Switch>
                                <Switch.Label as="span" className="ml-3">
                                  <span className="text-sm font-medium">
                                    Enable start using group monitors
                                  </span>
                                </Switch.Label>
                              </Switch.Group>
                            </div>
                          </div>
                        </div>

                        <div className="flex-shrink-0 px-4 py-4 flex justify-end">
                          <button
                            type="button"
                            className="uppercase bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50 "
                            onClick={() => setOpen(false)}
                          >
                            Cancel
                          </button>
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
                </div>
              </div>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

type TGDialogProps = DialogProps & {
  taskGroup?: TaskGroup;
};

function TaskGroupSlideover({ open, setOpen, taskGroup }: TGDialogProps) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        auto-reopen="true"
        className="fixed inset-0 overflow-hidden text-white"
        onClose={setOpen}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
            <Transition.Child
              as={Fragment}
              enter="transform transition ease-in-out duration-500 "
              enterFrom="translate-x-full"
              enterTo="translate-x-0"
              leave="transform transition ease-in-out duration-500 "
              leaveFrom="translate-x-0"
              leaveTo="translate-x-full"
            >
              <div className="w-screen max-w-md">
                <div className="h-full flex flex-col py-6 bg-[#131212] shadow-xl overflow-y-scroll">
                  <div className="px-4 sm:px-6">
                    <div className="flex items-start justify-between">
                      <Dialog.Title className="text-lg font-medium ">
                        {taskGroup ? "Edit" : "Add"} Task Group
                      </Dialog.Title>
                      <div className="ml-3 h-7 flex items-center">
                        <button
                          className="  text-white rounded-md hover:text-opacity-50 focus:outline-none  "
                          onClick={() => setOpen(false)}
                        >
                          <XIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* <div className={"space-y-6"}> */}
                  <Formik
                    initialValues={{
                      name:
                        taskGroup?.name ||
                        `Task Group ${TaskGroupModel.all().length + 1}`,
                      retryDelay: taskGroup?.retryDelay ?? 3500,
                      storePassword: taskGroup?.storePassword || "",
                      timeout: taskGroup?.timeout ?? 15,
                      storeName: taskGroup?.store?.name || "",
                      storeUrl: taskGroup?.store?.url || "",
                      store: taskGroup?.store
                        ? //is it in the stores list?
                          stores.find((v) => v.url === taskGroup.store.url)
                          ? taskGroup.store.url
                          : "custom"
                        : //if there wasn't a store regardless then it's the first one.
                          stores[0].url,
                    }}
                    validationSchema={yup.object().shape({
                      name: yup.string().required(),

                      storeUrl: yup.string().url(),
                    })}
                    onSubmit={(values, helpers) => {
                      const store = stores.find((v) => v.url === values.store);

                      if (!store) {
                        if (!values.storeName) {
                          helpers.setFieldError(
                            "storeName",
                            "Enter the store's name"
                          );
                          return;
                        }
                        if (!values.storeUrl) {
                          helpers.setFieldError(
                            "storeUrl",
                            "Enter the store's url"
                          );
                          return;
                        }
                      }
                      if (!taskGroup) {
                        const newGroup = TaskGroupModel.create({
                          name: values.name,
                          retryDelay: values.retryDelay,
                          timeout: values.timeout,
                          storePassword: values.storePassword,
                          store:
                            values.store === "custom"
                              ? {
                                  name: values.storeName,
                                  url: normalizeUrl(values.storeUrl),
                                  platform: Platform.Shopify,
                                }
                              : store!,
                        });
                        console.log(newGroup.store, values.store);
                        newGroup.save();
                      } else {
                        // i may have to switch to DAL
                        const tg = TaskGroupModel.findById(taskGroup.id)!;
                        tg.name = values.name;
                        tg.retryDelay = values.retryDelay;
                        tg.timeout = values.timeout;
                        tg.storePassword = values.storePassword;
                        tg.store =
                          values.store === "custom"
                            ? {
                                name: values.storeName,
                                url: normalizeUrl(values.storeUrl),
                                platform: Platform.Shopify,
                              }
                            : store!;
                        tg.save();
                      }
                      helpers.setSubmitting(false);
                      setOpen(false);
                    }}
                  >
                    <Form className={"h-full flex flex-col  "}>
                      <TaskGroupForm taskGroup={taskGroup} />
                      <div className="flex-shrink-0 px-4 py-4 flex justify-end">
                        <button
                          type="button"
                          className="uppercase bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50 "
                          onClick={() => setOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="uppercase  ml-2 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 "
                        >
                          Save
                        </button>
                      </div>
                    </Form>
                  </Formik>
                </div>
              </div>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

type TaskGroupDetailProps = {
  group: ReturnModelType<typeof TaskGroup>;
};

type TaskDetailsProps<T extends Task> = TaskGroupDetailProps & {
  onEditClicked: (task: T) => void;
};

function MonitorTasks({ group, onEditClicked }: TaskDetailsProps<MonitorTask>) {
  const ref = useRef<Table>();

  useEffect(() => {
    const updater = () => {
      ref?.current?.forceUpdateGrid();
    };
    const evt = `updateMonitorView_${group.id}`;

    ipcRenderer.on(evt, updater);

    return () => {
      ipcRenderer.removeListener(evt, updater);
    };
  }, [group]);
  return (
    <AutoSizer>
      {({ height, width }) => (
        <Table
          width={width}
          height={height}
          headerHeight={20}
          // @ts-ignore
          ref={ref}
          headerClassName={
            "text-gray-500 py-1 text-left text-xs font-medium  uppercase tracking-wider ml-0"
          }
          headerStyle={{ marginLeft: "0" }}
          rowHeight={47}
          overscanRowCount={0}
          rowCount={group.monitors.length || 0}
          rowGetter={({ index }) => group.monitors[index]}
          // rowClassName={}
          rowRenderer={(props: TableRowProps) => (
            <>
              <HighlightTableRowRenderer {...props} />
            </>
          )}
        >
          <Column
            label="Product"
            dataKey="product"
            width={350}
            className={" py-1 whitespace-nowrap text-xs font-medium ml-0"}
            // flexShrink={0}

            cellRenderer={(props: TableCellProps) => {
              // console.log("rowData", props.rowData.constructor.name);
              const task: BuyerTask = props.rowData;
              const { product } = task;
              return (
                <>
                  {!product && (
                    <>
                      <QuestionMarkCircleIcon
                        className={
                          "h-9 w-9 p-1 inline mr-2 text-gray-200  rounded-md border-[#272727] border-2 "
                        }
                      />
                      {task.monitor}
                    </>
                  )}
                  {product && (
                    <>
                      {/* <div className={"inline"}> */}
                      <img
                        src={product.product.imageURL}
                        className={
                          "h-9 w-9 inline mr-2  text-gray-200  rounded-md  "
                        }
                      />
                      {/* </div> */}

                      <div className={"inline-flex flex-col"}>
                        <div>{product.product.title}</div>
                        {/* <div>{task.monitor}</div> */}
                      </div>
                    </>
                  )}
                </>
              );
            }}
          />
          <Column
            width={250}
            label="Size"
            dataKey="id"
            className={" py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              const task: BuyerTask = props.rowData;
              const { product } = task;

              return (
                <>
                  {product
                    ? product.product.variants
                        .filter((v) => v.inStock)
                        .map((v) => v.size)
                        .join(", ")
                    : task.isRandomSize()
                    ? ""
                    : task.sizes.join(", ")}
                </>
              );
            }}
          />

          <Column
            label="Proxy"
            dataKey="proxy"
            width={150}
            className={" py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              return <>{props.rowData.proxyGroup?.name}</>;
            }}
          />

          <Column
            width={300}
            label="Status"
            dataKey="id"
            className={"px-2 py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              const task: BuyerTask = props.rowData;
              const { message } = task;

              return !message ? (
                "Ready"
              ) : (
                <span
                  className={
                    message.type === MessageType.Warning
                      ? "text-yellow-600"
                      : message.type === MessageType.Error
                      ? "text-red-500"
                      : message.type == MessageType.Good
                      ? "text-green-600"
                      : ""
                  }
                >
                  {message.message}
                </span>
              );
            }}
          />
          <Column
            width={225}
            label="Actions"
            dataKey="id"
            className={"px-2 py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              const task: MonitorTask = props.rowData;

              return (
                <>
                  <button
                    onClick={() => {
                      if (task.isRunning) {
                        stopMonitors([task.id]);
                      } else {
                        startMonitors(group.id, [task.id]);
                      }
                    }}
                  >
                    {task.isRunning ? (
                      <StopIcon
                        className={
                          "bg-red-600 hover:bg-red-700 h-6 w-6 p-1 rounded-md"
                        }
                      />
                    ) : (
                      <PlayIcon
                        className={
                          "bg-green-600 hover:bg-green-700 h-6 w-6 p-1 rounded-md"
                        }
                      />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      onEditClicked(props.rowData);
                    }}
                  >
                    <PencilIcon
                      className={
                        "bg-[#272727] hover:bg-[#202020] ml-1 h-6 w-6 p-1 rounded-md"
                      }
                    />
                  </button>
                  <button
                    onClick={() => {
                      const g = MonitorTask.create<MonitorTask>({
                        ...props.rowData,
                        proxy: undefined,
                        isRunning: false,
                        message: undefined,

                        product: undefined,
                        id: generateID(),
                      });

                      group.addMonitor(g);

                      group.save();
                    }}
                  >
                    <DuplicateIcon
                      className={
                        "text-white bg-yellow-600 hover:bg-yellow-700h-6 w-6 p-1 rounded-md ml-1"
                      }
                    />
                  </button>
                  <button
                    onClick={() => {
                      group.monitors = group.monitors.filter(
                        (p) => p !== props.rowData
                      );
                      group.save();
                    }}
                  >
                    <TrashIcon
                      className={
                        "text-white bg-red-600 hover:bg-red-700 h-6 w-6 p-1 rounded-md ml-1"
                      }
                    />
                  </button>
                </>
              );
            }}
          />
        </Table>
      )}
    </AutoSizer>
  );
}

function BuyerTasks({ group, onEditClicked }: TaskDetailsProps<BuyerTask>) {
  const ref = useRef<Table>();

  useEffect(() => {
    const updater = () => {
      ref?.current?.forceUpdateGrid();
    };
    const evt = `updateBuyerView_${group.id}`;

    ipcRenderer.on(evt, updater);

    return () => {
      ipcRenderer.removeListener(evt, updater);
    };
  }, [group]);

  return (
    <AutoSizer>
      {({ height, width }) => (
        <Table
          width={width}
          height={height}
          headerHeight={20}
          // @ts-ignore
          ref={ref}
          headerClassName={
            "text-gray-500 py-1 text-left text-xs font-medium  uppercase tracking-wider ml-0"
          }
          overscanRowCount={0}
          data={group.buyers}
          headerStyle={{ marginLeft: "0" }}
          rowHeight={47}
          rowCount={group.buyers.length || 0}
          rowGetter={({ index }) => group.buyers[index]}
          // rowClassName={}
          rowRenderer={(props: TableRowProps) => (
            <HighlightTableRowRenderer {...props} />
          )}
        >
          <Column
            label="Product"
            dataKey="product"
            width={300}
            className={" py-1 whitespace-nowrap text-xs font-medium ml-0"}
            // flexShrink={0}

            cellRenderer={(props: TableCellProps) => {
              // console.log("rowData", props.rowData.constructor.name);
              const task: BuyerTask = props.rowData;
              const { product } = task;
              return (
                <>
                  {!product && (
                    <>
                      <QuestionMarkCircleIcon
                        className={
                          "h-9 w-9 p-1 inline mr-2 text-gray-200  rounded-md border-[#272727] border-2 "
                        }
                      />
                      {task.monitor}
                    </>
                  )}
                  {product && (
                    <>
                      <img
                        src={product.product.imageURL}
                        className={
                          "h-9 w-9 inline mr-2  text-gray-200  rounded-md  "
                        }
                      />
                      {product.product.title}
                    </>
                  )}
                </>
              );
            }}
          />
          <Column
            width={150}
            label="Size"
            dataKey="id"
            className={" py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              const task: BuyerTask = props.rowData;
              const { product } = task;

              return (
                <>
                  {product
                    ? product.variant.size
                    : task.isRandomSize()
                    ? "Random"
                    : task.sizes.join(", ")}
                </>
              );
            }}
          />

          <Column
            label="Profile"
            dataKey="status"
            width={200}
            className={" py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              return <>{props.rowData.profile?.name}</>;
            }}
          />
          <Column
            label="Proxy"
            dataKey="proxy"
            width={150}
            className={" py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              return <>{props.rowData.proxyGroup?.name}</>;
            }}
          />

          <Column
            width={300}
            label="Status"
            dataKey="status"
            className={"px-2 py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              const task: BuyerTask = props.rowData;
              const { message, signal } = task;
              return !message ? (
                "Ready"
              ) : (
                <span
                  className={
                    message.type === MessageType.Warning
                      ? "text-yellow-600"
                      : message.type === MessageType.Error
                      ? "text-red-500"
                      : message.type == MessageType.Good
                      ? "text-green-600"
                      : ""
                  }
                >
                  {signal ? `[${signal}]` : ``} {message.message}
                </span>
              );
            }}
          />
          <Column
            width={250}
            label="Actions"
            dataKey="id"
            className={"px-2 py-1 whitespace-nowrap text-xs font-medium"}
            cellRenderer={(props: TableCellProps) => {
              const task: BuyerTask = props.rowData;

              return (
                <>
                  <button
                    onClick={() => {
                      if (task.isRunning) {
                        stopBuyers(group, [task.id]);
                      } else {
                        startBuyers(group, [task.id]);
                      }
                    }}
                  >
                    {task.isRunning ? (
                      <StopIcon
                        className={
                          "bg-red-600 hover:bg-red-700 h-6 w-6 p-1 rounded-md"
                        }
                      />
                    ) : (
                      <PlayIcon
                        className={
                          "bg-green-600 hover:bg-green-700 h-6 w-6 p-1 rounded-md"
                        }
                      />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      console.log(props.rowData);
                      onEditClicked(props.rowData);
                    }}
                  >
                    <PencilIcon
                      className={
                        "bg-[#272727] hover:bg-[#202020] ml-1 h-6 w-6 p-1 rounded-md"
                      }
                    />
                  </button>
                  <button
                    onClick={() => {
                      // const g =  { ...props.rowData, id: generateID() };
                      console.time("gsave");
                      const g = BuyerTask.create<BuyerTask>({
                        ...props.rowData,
                        proxy: undefined,
                        isRunning: false,
                        message: undefined,
                        exitStatus: undefined,

                        product: undefined,
                        id: generateID(),
                      });
                      group.addBuyerTask(g);

                      group.save();
                      console.timeEnd("gsave");
                      console.log(group.buyers.length, "new buyers");
                    }}
                  >
                    <DuplicateIcon
                      className={
                        "text-white bg-yellow-600 hover:bg-yellow-700h-6 w-6 p-1 rounded-md ml-1"
                      }
                    />
                  </button>
                  <button
                    onClick={() => {
                      stopBuyers(group, [props.rowData.id]);

                      deleteBuyers(group, [props.rowData.id]);
                    }}
                  >
                    <TrashIcon
                      className={
                        "text-white bg-red-600 hover:bg-red-700 h-6 w-6 p-1 rounded-md ml-1"
                      }
                    />
                  </button>
                </>
              );
            }}
          />
        </Table>
      )}
    </AutoSizer>
  );
}

function TaskGroupDetail({ group }: TaskGroupDetailProps) {
  //
  const [isMonitor, setIsMonitor] = useState(false);
  const [addBuyerDialogOpen, setAddBuyerDialogOpen] = useState(false);
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [buyerDialogOpen, setBuyerDialogOpen] = useState(false);
  const [selectedMonitor, setSelectedMonitor] = useState<MonitorTask[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerTask[]>([]);

  // 39248133193856
  const quickLinkChange = () => {
    post("quickMonitorChange", {
      group: group.id,
    });
  };

  useEffect(() => {
    const kl = (ev: KeyboardEvent) => {
      if (ev.key === "F1") {
        quickLinkChange();
      }
    };
    document.addEventListener("keydown", kl);

    return () => {
      document.removeEventListener("keydown", kl);
    };
  }, []);

  useEffect(() => {
    setIsMonitor(false);
  }, [group]);

  return (
    <div className={"flex flex-col flex-grow"}>
      {/* toggles and whatnot */}
      <div className={"flex justify-between"}>
        <div>
          <h1 className={"text-xl "}>{group.name}</h1>
          <h4 className={"text-base opacity-50"}>
            {group.store.name} |{" "}
            {isMonitor ? group.monitors.length : group.buyers.length}{" "}
            {isMonitor ? "Monitors" : "Tasks"}
          </h4>
        </div>

        <div className={"flex flex-row"}>
          <div
            className={
              " justify-center group p-1 rounded-md flex h-9 flex-shrink  w-46  bg-[#131212] text-gray-500  text-sm"
            }
          >
            <button
              className={"focus-visible:ring-2 px-3 py-1  uppercase focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded-md focus:outline-none focus-visible:ring-offset-gray-100 ".concat(
                !isMonitor ? "text-white bg-[#1f1f1f] " : " "
              )}
              onClick={() => {
                setIsMonitor(false);
              }}
            >
              Tasks
            </button>
            <button
              className={" px-3 py-1 uppercase rounded-md flex items-center   ".concat(
                isMonitor ? "text-white bg-[#1f1f1f]" : ""
              )}
              onClick={() => setIsMonitor(true)}
            >
              Monitors
            </button>
          </div>
          <div className={"ml-2 mt-0.5  "}>
            <button
              className={
                " px-3 py-1.5 shadow-sm max-h-8  bg-white hover:bg-gray-100 text-black text-xs  rounded-md flex items-center "
              }
              onClick={() => {
                if (isMonitor) {
                  setSelectedMonitor([]);
                  setMonitorDialogOpen(true);
                } else {
                  setSelectedBuyer([]);
                  setAddBuyerDialogOpen(true);
                }
              }}
            >
              <PlusIcon className=" mr-2 h-5 w-5" aria-hidden="true" />
              Add {isMonitor ? "Monitors" : "Tasks"}
            </button>
          </div>
        </div>
      </div>
      {/* buttons  */}
      <div
        className={
          "flex flex-row grid-cols divide-x mt-3 uppercase md:gap-3 gap-1 divide-[#272727]"
        }
      >
        <div>
          <button
            type="button"
            className="inline-flex items-center px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none "
            onClick={() => {
              if (isMonitor) {
                startMonitors(
                  group.id,
                  group.monitors.filter((b) => !b.isRunning).map((b) => b.id)
                );
              } else {
                startBuyers(
                  group,
                  group.buyers.filter((b) => !b.isRunning).map((b) => b.id)
                );
              }
            }}
          >
            <PlayIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Start All
          </button>
          <button
            type="button"
            className="inline-flex items-center ml-1 md:ml-3 px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-red-600 hover:bg-red-700 "
            onClick={() => {
              if (isMonitor) {
                stopMonitors(
                  group.monitors.filter((b) => b.isRunning).map((b) => b.id)
                );
              } else {
                stopBuyers(
                  group,
                  group.buyers.filter((b) => b.isRunning).map((b) => b.id)
                );
              }
            }}
          >
            <StopIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Stop All
          </button>
        </div>
        <div>
          <button
            type="button"
            className="ml-3 inline-flex items-center px-3 py-1.5  border border-transparent  shadow-sm text-xs rounded-md text-white bg-[#272727] hover:bg-[#202020] focus:outline-none "
            onClick={() => {
              if (isMonitor) {
                setSelectedMonitor(group.monitors);
                setMonitorDialogOpen(true);
              } else {
                setSelectedBuyer(group.buyers);
                setBuyerDialogOpen(true);
              }
            }}
          >
            <PencilIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Edit All
          </button>
          <button
            type="button"
            className="inline-flex items-center ml-3 px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-yellow-600 hover:bg-yellow-700 "
            onClick={() => {
              if (isMonitor) {
                group.monitors.push(
                  ...group.monitors.map((m) => {
                    return MonitorTask.create<MonitorTask>({
                      ...m,
                      proxy: undefined,
                      isRunning: false,
                      message: undefined,
                      product: undefined,
                      id: generateID(),
                    });
                  })
                );
                group.save();
              } else {
                group.buyers.push(
                  ...group.buyers.map((t) => {
                    return BuyerTask.create<BuyerTask>({
                      ...t,
                      proxy: undefined,
                      isRunning: false,
                      message: undefined,
                      exitStatus: undefined,

                      product: undefined,
                      id: generateID(),
                    });
                  })
                );
                group.save();
              }
            }}
          >
            <DuplicateIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Copy All
          </button>
          <button
            type="button"
            className="inline-flex items-center ml-3 px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-red-600 hover:bg-red-700 "
            onClick={() => {
              if (isMonitor) {
                stopMonitors(
                  group.monitors.filter((b) => b.isRunning).map((b) => b.id)
                );
                group.monitors = [];
              } else {
                stopBuyers(
                  group,
                  group.buyers.filter((b) => b.isRunning).map((b) => b.id)
                );

                group.buyers = [];
              }
              // stop tasks
              group.save();
            }}
          >
            <TrashIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Delete All
          </button>
        </div>
        {group.store.platform === Platform.Shopify && (
          <div>
            <button
              type="button"
              className="ml-3 inline-flex items-center px-3 py-1.5  border border-transparent  shadow-sm text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none "
              onClick={() => quickLinkChange()}
            >
              <LinkIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              Link Change (F1)
            </button>
          </div>
        )}
      </div>
      {/* <div className={"h-[90%]"}> */}
      <div className={"h-full"}>
        <div className={"mt-5"} />
        {isMonitor && (
          <MonitorTasks
            group={group}
            onEditClicked={(e) => {
              setSelectedMonitor([e]);
              setMonitorDialogOpen(true);
            }}
          />
        )}
        {!isMonitor && (
          <BuyerTasks
            group={group}
            onEditClicked={(e) => {
              setSelectedBuyer([e]);
              setBuyerDialogOpen(true);
            }}
          />
        )}
      </div>
      <AddBuyerTasksDialog
        taskGroup={group}
        open={addBuyerDialogOpen}
        setOpen={setAddBuyerDialogOpen}
      />
      {selectedBuyer.length > 0 && (
        <BuyerTaskDialog
          tasks={selectedBuyer}
          taskGroup={group}
          open={buyerDialogOpen}
          setOpen={setBuyerDialogOpen}
        />
      )}
      <MonitorTaskDialog
        taskGroup={group}
        tasks={selectedMonitor}
        open={monitorDialogOpen}
        setOpen={setMonitorDialogOpen}
      />
    </div>
  );
}

type AddBuyerTasksDialogProps = DialogProps & {
  taskGroup: ReturnModelType<typeof TaskGroup>;
};

type MonitorTaskDialogProps = DialogProps & {
  tasks?: MonitorTask[];
  taskGroup: ReturnModelType<typeof TaskGroup>;
};

type MonitorFormProps = {
  taskGroup: TaskGroup;
};
export function MonitorForm({ taskGroup }: MonitorFormProps) {
  const { values, errors, setFieldValue, handleChange } =
    useFormikContext<any>();
  return (
    <div className="mt-2 w-full text-white ">
      <div>
        {/* <div className={"grid grid-cols-2 gap-2"}> */}
        <div>
          <label className="block text-sm font-medium">
            {taskGroup.store.platform === Platform.Shopify
              ? "Link | Variant | Keywords"
              : "SKU"}
          </label>
          <div className="mt-1">
            <Field
              name="monitor"
              className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name="monitor"
              className={"text-red-500 text-sm"}
              component={"div"}
            />
          </div>
        </div>
        {/* <div>
          <label className="block text-sm font-medium">Sizes</label>
          <div className="mt-1">
            <MultiSelect
              filterOptions={insensitiveFilter}
              options={sizes.map((o) => {
                return {
                  label: o,
                  value: o,
                };
              })}
              value={values.sizes.map((s: string) => {
                return {
                  label: s,
                  value: s,
                };
              })}
              isCreatable
              overrideStrings={{
                allItemsAreSelected: "All Selected",
              }}
              debounceDuration={100}
              ClearSelectedIcon={
                <XIcon
                  className={
                    "h-5 w-5 rounded-full p-0.5 hover:bg-white hover:bg-opacity-20"
                  }
                />
              }
              onChange={(v: any) => {
                setFieldValue(
                  "sizes",
                  v.map((s: any) => s.value)
                );
              }}
              labelledBy="Select"
            />
            <ErrorMessage
              name="sizes"
              className={"text-red-500 text-sm"}
              component={"div"}
            />
          </div>
        </div> */}
      </div>
      <div className={"grid grid-cols-2 mt-3 gap-2"}>
        <div>
          <label className="block text-sm font-medium  ">Proxy Group</label>
          <div className="mt-1">
            <Field
              name="proxyGroup"
              as="select"
              className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
            >
              <option value={""}>None</option>

              {ProxyGroupModel.all().map((p) => (
                <option key={`pxg-${p.id}`} value={p.id}>
                  {p.name} ({p.proxies.length} Proxies)
                </option>
              ))}
            </Field>
            <ErrorMessage
              name="proxyGroup"
              className={"text-red-500 text-sm"}
              component={"div"}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Delay</label>
          <div className="mt-1">
            <Field
              name="delay"
              type="number"
              className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name="delay"
              className={"text-red-500 text-sm"}
              component={"div"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MonitorTaskDialog({
  taskGroup,
  tasks,
  open,
  setOpen,
}: MonitorTaskDialogProps) {
  const first = tasks ? tasks[0] : undefined;

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
                  monitor: first?.monitor ?? "",
                  proxyGroup: first?.proxyGroup?.id ?? "",
                  sizes: first?.sizes || ["random"],
                  delay: first?.delay ?? 3500,
                }}
                validationSchema={yup.object().shape({
                  monitor: yup
                    .string()
                    .required(
                      taskGroup.store.platform === Platform.Shopify
                        ? "Enter your link, variant, or keywords"
                        : "Enter your SKU"
                    ),
                  sizes: yup.array().of(yup.string()).default(["random"]),
                  delay: yup.number().positive(),
                })}
                onSubmit={(values, helpers) => {
                  const pg = ProxyGroupModel.findById(values.proxyGroup);
                  values.monitor = values.monitor.includes("://")
                    ? formatProductURL(values.monitor)
                    : values.monitor;
                  if (tasks?.length) {
                    for (let task of tasks) {
                      task.monitor = values.monitor;
                      task.delay = values.delay;
                      task.proxyGroup = pg;
                      task.sizes = values.sizes;
                      if (values.monitor != first?.monitor) {
                        task.product = undefined;
                      }
                    }
                  } else {
                    taskGroup.addMonitor(
                      MonitorTask.create<MonitorTask>({
                        monitor: values.monitor,
                        delay: values.delay,
                        proxyGroup: pg,
                        sizes: values.sizes,
                      })
                    );
                  }
                  taskGroup.save();
                  helpers.resetForm();
                  if (tasks?.length) {
                    setOpen(false);
                  }
                }}
              >
                <Form>
                  <div className="w-full">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <div className={"flex justify-between"}>
                        <Dialog.Title
                          as="h3"
                          className="text-lg leading-6 font-medium text-white"
                        >
                          {tasks?.length ? "Edit" : " Add"} Monitor
                          {tasks && tasks.length > 1 ? "s" : ""}
                        </Dialog.Title>
                      </div>
                      <MonitorForm taskGroup={taskGroup} />
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

type BuyerTaskDialogProps = DialogProps & {
  tasks: BuyerTask[];
  taskGroup: ReturnModelType<typeof TaskGroup>;
};

function BuyerTaskDialog({
  taskGroup,
  tasks,
  open,
  setOpen,
}: BuyerTaskDialogProps) {
  const [isAdvanced, setIsAdvanced] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsAdvanced(false);
    }
  }, [open]);

  const first = tasks[0];
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
                  monitor: first.monitor,
                  profile: first.profile?.id || "",

                  profileGroup: first.profile?.profileGroup?.id || "",
                  proxyGroup: first.proxyGroup?.id || "",
                  sizes: first.sizes || ["random"],

                  // advanced
                  accountGroup: first.accountGroup?.id || "",
                  shippingRate: first.shippingRate || "",
                  flags: first.flags ?? 0,
                }}
                validationSchema={yup.object().shape({
                  monitor: yup
                    .string()
                    .required(
                      taskGroup.store.platform === Platform.Shopify
                        ? "Enter your link, variant, or keywords"
                        : "Enter your SKU"
                    ),
                  sizes: yup.array().of(yup.string()).default(["random"]),

                  profile: yup.string().required("Select a profile"),
                })}
                onSubmit={(values, helpers) => {
                  const pg = ProfileGroupModel.findById(values.profileGroup)!;

                  const profile = values.profile
                    ? pg.profiles.find((p) => p.id === values.profile)
                    : first.profile;

                  if (!profile) {
                    helpers.setFieldError("profile", "Select a profile");
                    return;
                  }

                  const ag = AccountGroupModel.findById(values.accountGroup);
                  const pxg = ProxyGroupModel.findById(values.proxyGroup);
                  values.monitor = values.monitor.includes("://")
                    ? formatProductURL(values.monitor)
                    : values.monitor;

                  for (let task of tasks) {
                    task.accountGroup = ag;
                    task.flags = values.flags;

                    task.profile = profile!;
                    task.monitor = values.monitor;
                    task.shippingRate = values.shippingRate;
                    task.sizes = values.sizes;
                    task.proxyGroup = pxg;

                    if (values.monitor != first.monitor) {
                      task.product = undefined;
                    }
                  }
                  taskGroup.save();
                  setOpen(false);

                  helpers.resetForm();
                }}
              >
                <Form>
                  <div className="w-full">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <div className={"flex justify-between"}>
                        <Dialog.Title
                          as="h3"
                          className="text-lg leading-6 font-medium text-white"
                        >
                          Edit task{tasks.length > 1 ? "s" : ""}
                        </Dialog.Title>
                        {taskGroup.store.platform === Platform.Shopify && (
                          <div
                            className={
                              " justify-center group p-1 rounded-md flex h-9 flex-shrink  w-46  bg-[#131212] text-gray-500  text-sm"
                            }
                          >
                            <button
                              className={"focus-visible:ring-2 px-3 py-1  uppercase focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded-md focus:outline-none focus-visible:ring-offset-gray-100 ".concat(
                                !isAdvanced ? "text-white bg-[#1f1f1f] " : " "
                              )}
                              type="button"
                              onClick={() => {
                                setIsAdvanced(false);
                              }}
                            >
                              Basic
                            </button>
                            <button
                              className={" px-3 py-1 uppercase rounded-md flex items-center   ".concat(
                                isAdvanced ? "text-white bg-[#1f1f1f]" : ""
                              )}
                              type="button"
                              onClick={() => setIsAdvanced(true)}
                            >
                              Advanced
                            </button>
                          </div>
                        )}
                      </div>
                      {!isAdvanced && (
                        <BuyerForm taskGroup={taskGroup} isAdding={false} />
                      )}
                      {isAdvanced && (
                        <BuyerFormAdvanced taskGroup={taskGroup} />
                      )}
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

function AddBuyerTasksDialog({
  taskGroup,
  open,
  setOpen,
}: AddBuyerTasksDialogProps) {
  const [isAdvanced, setIsAdvanced] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsAdvanced(false);
    }
  }, [open]);

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
                  monitor: "",
                  profile: "",
                  profileGroup:
                    ProfileGroupModel.all().find((g) => g.profiles.length)
                      ?.id || "",
                  proxyGroup: "",
                  count: 1,
                  sizes: ["random"],

                  // advanced
                  accountGroup: "",
                  shippingRate: "",
                  flags: 0,
                }}
                validationSchema={yup.object().shape({
                  monitor: yup
                    .string()
                    .required(
                      taskGroup.store.platform === Platform.Shopify
                        ? "Enter your link, variant, or keywords"
                        : "Enter your SKU"
                    ),
                  sizes: yup.array().of(yup.string()).default(["random"]),
                  profileGroup: yup.string().required(),
                  count: yup.number().min(1).required(),
                })}
                onSubmit={(values, helpers) => {
                  const pg = ProfileGroupModel.findById(values.profileGroup)!;
                  const proxyGroup = ProxyGroupModel.findById(
                    values.proxyGroup
                  );
                  const tasks: BuyerTask[] = [];
                  values.monitor = values.monitor.includes("://")
                    ? formatProductURL(values.monitor)
                    : values.monitor;
                  for (let i = 0; i < values.count; i++) {
                    const profile = pg.profiles.find(
                      (p) => p.id === values.profile
                    );
                    if (profile) {
                      tasks.push(
                        BuyerTask.create<BuyerTask>({
                          accountGroup: AccountGroupModel.findById(
                            values.accountGroup
                          ),
                          flags: values.flags,
                          profile: profile,
                          monitor: values.monitor,
                          shippingRate: values.shippingRate,
                          sizes: values.sizes,

                          group: taskGroup,
                          proxyGroup: proxyGroup,
                        })
                      );
                    } else {
                      for (let profile of pg.profiles) {
                        tasks.push(
                          BuyerTask.create<BuyerTask>({
                            accountGroup: AccountGroupModel.findById(
                              values.accountGroup
                            ),
                            flags: values.flags,
                            profile: profile,
                            monitor: values.monitor,
                            group: taskGroup,
                            shippingRate: values.shippingRate,
                            sizes: values.sizes,

                            proxyGroup: proxyGroup,
                          })
                        );
                      }
                    }
                  }
                  tasks.forEach((t) => taskGroup.addBuyerTask(t));

                  const monitor = taskGroup.monitors.find(
                    (m) => m.monitor === values.monitor
                  );
                  if (!monitor) {
                    const monitor = MonitorTask.create<MonitorTask>({
                      group: taskGroup,
                      proxyGroup: proxyGroup,
                      delay: 3500,
                      monitor: values.monitor,
                    });
                    taskGroup.addMonitor(monitor);
                  }

                  taskGroup.save();
                  helpers.resetForm();
                }}
              >
                <Form>
                  <div className="w-full">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <div className={"flex justify-between"}>
                        <Dialog.Title
                          as="h3"
                          className="text-lg leading-6 font-medium text-white"
                        >
                          Add tasks
                        </Dialog.Title>
                        {taskGroup.store.platform === Platform.Shopify && (
                          <div
                            className={
                              " justify-center group p-1 rounded-md flex h-9 flex-shrink  w-46  bg-[#131212] text-gray-500  text-sm"
                            }
                          >
                            <button
                              className={"focus-visible:ring-2 px-3 py-1  uppercase focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded-md focus:outline-none focus-visible:ring-offset-gray-100 ".concat(
                                !isAdvanced ? "text-white bg-[#1f1f1f] " : " "
                              )}
                              type="button"
                              onClick={() => {
                                setIsAdvanced(false);
                              }}
                            >
                              Basic
                            </button>
                            <button
                              className={" px-3 py-1 uppercase rounded-md flex items-center   ".concat(
                                isAdvanced ? "text-white bg-[#1f1f1f]" : ""
                              )}
                              type="button"
                              onClick={() => setIsAdvanced(true)}
                            >
                              Advanced
                            </button>
                          </div>
                        )}
                      </div>
                      {!isAdvanced && (
                        <BuyerForm taskGroup={taskGroup} isAdding />
                      )}
                      {isAdvanced && (
                        <BuyerFormAdvanced taskGroup={taskGroup} />
                      )}
                    </div>
                  </div>
                  <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                    <button
                      type="submit"
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600 hover:bg-purple-700 text-base font-medium text-white  sm:ml-3 sm:w-auto sm:text-sm"
                      onClick={() => {}}
                    >
                      Add
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

export default function TasksPage() {
  const tgs = useDALRecords<TaskGroup>(TaskGroupModel);
  const [selected, setSelected] = useState(tgs[0]?.id);
  const tg = TaskGroupModel.findById(selected);

  return (
    <Layout>
      <SecondaryContainer>
        <TasksSidebar
          selectedId={selected}
          // @ts-ignore
          taskGroups={tgs || []}
          onSelectionClicked={(idx) => {
            setSelected(idx);
          }}
        />
      </SecondaryContainer>
      <PrimaryContainer>
        {tg && <TaskGroupDetail group={tg} />}
      </PrimaryContainer>
    </Layout>
  );
}
