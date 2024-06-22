import { ProxyGroupModel, ReturnModelType } from "src/dal/DAL";
import { proxiesToString } from "@core/util/helpers";
import { BaseModel } from "@entities/BaseModel";
import { ProxyGroup } from "@entities/ProxyGroup";
import { ProxyGroupProxy } from "@entities/ProxyGroupProxy";
import { Dialog, Transition } from "@headlessui/react";
import { FolderAddIcon } from "@heroicons/react/outline";
import {
  FolderIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/solid";
import { Layout } from "@ui/components/Layout";
import { PrimaryContainer } from "@ui/components/PrimaryContainer";
import { SecondaryContainer } from "@ui/components/SecondayContainer";
import { DialogProps } from "@ui/components/SlideOverProps";
import { useDALRecords } from "@ui/utils/hooks";
import { ErrorMessage, Field, Form, Formik, useFormikContext } from "formik";
import React, { Fragment, useEffect, useState } from "react";
import * as yup from "yup";
import { ContextMenu, ContextMenuTrigger, MenuItem } from "react-contextmenu";

type SidebarProps = {
  selectedId?: string;
  proxyGroups?: ReturnModelType<typeof ProxyGroup>[];
  onSelectionClicked?: (id: string) => void;
};

function ProxyGroupSidebar({
  proxyGroups,
  selectedId,
  onSelectionClicked,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProxyGroup | undefined>(undefined);

  const openFresh = () => {
    setSelected(undefined);
    setOpen(true);
  };

  const openEdit = (selected?: ProxyGroup) => {
    setSelected(selected);
    setOpen(true);
  };

  return (
    <>
      <div className={"uppercase font-medium pb-2 text-sm text-opacity-30"}>
        Proxy groups
        <button
          className={"ml-2 p-1 h-5 w-5 rounded-md uppercase text-xs text-black bg-gray-200 opacity-100 cursor-pointer ".concat(
            !proxyGroups?.length ? "hidden" : ""
          )}
          onClick={() => openFresh()}
        >
          <PlusIcon className={"h-full w-full cursor-pointer"} />
        </button>
      </div>
      {!proxyGroups?.length && (
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
              Create a new proxy group
            </span>
          </button>
        </div>
      )}
      {!!proxyGroups?.length && (
        <div className={"h-full overflow-hidden overflow-y-auto w-full"}>
          {proxyGroups?.map((tg) => (
            <>
              <ContextMenuTrigger id={`pgc-${tg.id}`} holdToDisplay={-1}>
                <div
                  className={"rounded-md   px-3 py-2  border mb-3  cursor-pointer ".concat(
                    selectedId === tg.id
                      ? "border-[#272727] shadow-md  bg-[#1f1f1f] bg-opacity-50 "
                      : // ? "border-purple-600 shadow-md"
                        "border-[#272727] hover:border-purple-600 hover:border-opacity-50 select-none "
                  )}
                  onClick={() => {
                    if (onSelectionClicked) {
                      onSelectionClicked(tg.id);
                    }
                    if (selectedId === tg.id) {
                      setSelected(tg);
                      setOpen(true);
                    }
                  }}
                >
                  <div className={"flex align-center flex-row"}>
                    <FolderIcon
                      className={"h-6 w-6 m-2 text-gray-600 inline"}
                    />
                    <div className={"truncate"}>
                      <span>{tg.name}</span>
                      <div
                        className={"text-sm font-medium text-white opacity-50"}
                      >
                        {tg.proxies.length} Proxies
                      </div>
                    </div>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenu
                id={`pgc-${tg.id}`}
                className={
                  "p-2 shadow-lg rounded-md z-50 bg-[#1f1f1f] border border-[#2e2e2e]"
                }
              >
                <MenuItem
                  data={{ foo: "bar" }}
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
          ))}
        </div>
      )}
      <ProxyGroupDialog open={open} setOpen={setOpen} proxyGroup={selected} />
    </>
  );
}

type ProxyGroupDialogProps = DialogProps & {
  proxyGroup?: ProxyGroup;
};

type ProxyGroupDetailProps = {
  group: ProxyGroup;
};

function ProxiesForm({ group }: ProxyGroupDetailProps) {
  const { setFieldValue } = useFormikContext<any>();

  useEffect(() => {
    setFieldValue("proxies", proxiesToString(group.proxies));
  }, [group]);
  return (
    <Field
      as={"textarea"}
      name={"proxies"}
      className="block flex-grow resize-none shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
    />
  );
}

function ProxyGroupDetail({ group }: ProxyGroupDetailProps) {
  return (
    <>
      <div className={"flex justify-between"}>
        <div>
          <h1 className={"text-xl "}>{group.name}</h1>
          <h4 className={"text-base opacity-50"}>
            {group.proxies.length} Proxies
          </h4>
        </div>
      </div>
      <div className={"h-full"}>
        <Formik
          initialValues={{
            proxies: proxiesToString(group.proxies) || "",
          }}
          onSubmit={(values, helpers) => {
            const ps = values.proxies.split("\n");
            const toAdd: ProxyGroupProxy[] = [];

            for (let pl of ps) {
              pl = pl.trim();
              if (!pl) {
                continue;
              }
              const predicate = (p: ProxyGroupProxy) => p.proxyString === pl;
              const existing =
                group.proxies.find(predicate) || toAdd.find(predicate);

              if (existing) {
                if (!toAdd.includes(existing)) {
                  toAdd.push(existing);
                }
                continue;
              }
              const z = new ProxyGroupProxy();
              z.proxyString = pl;
              toAdd.push(z);
            }
            group.proxies = toAdd;
            ProxyGroupModel.findById(group.id)?.save();
            // helpers.setFieldValue("proxies", proxiesToString(toAdd));
          }}
        >
          <Form className={"h-full flex flex-col"}>
            <div className={"text-xs text-gray-500 mt-3"}>
              host:port:username:password
            </div>
            <ProxiesForm group={group} />

            <div className={"flex content-end justify-end mt-3"}>
              <button
                type="submit"
                className="uppercase flex-shrink justify-center py-2 px-4 border border-transparent shadow-sm text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 "
              >
                Save
              </button>
            </div>
            {/* </div> */}
          </Form>
        </Formik>
      </div>
    </>
  );
}

function ProxyGroupDialog({
  proxyGroup,
  open,
  setOpen,
}: ProxyGroupDialogProps) {
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
                  name:
                    proxyGroup?.name ||
                    `Proxy Group ${ProxyGroupModel.all().length + 1}`,
                }}
                validationSchema={yup.object().shape({
                  name: yup.string().required(),
                })}
                onSubmit={(values, helpers) => {
                  if (proxyGroup) {
                    const pg = ProxyGroupModel.findById(proxyGroup.id);
                    if (pg) {
                      pg.name = values.name;
                      pg.save();
                    }
                  } else {
                    ProxyGroupModel.create({
                      name: values.name,
                    }).save();
                  }
                  setOpen(false);
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
                          {proxyGroup ? "Edit" : "Create"} proxy group
                        </Dialog.Title>
                      </div>
                      <div className="mt-2 w-full text-white">
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

export default function ProxiesPage() {
  const tgs = useDALRecords<ProxyGroup>(ProxyGroupModel);
  const [selected, setSelected] = useState(tgs[0]?.id);
  const pg = ProxyGroupModel.findById(selected);

  return (
    <Layout>
      <SecondaryContainer>
        <ProxyGroupSidebar
          selectedId={selected}
          // @ts-expect-error
          proxyGroups={tgs || []}
          onSelectionClicked={(idx) => {
            setSelected(idx);
          }}
        />
      </SecondaryContainer>
      <PrimaryContainer>
        {pg && <ProxyGroupDetail group={pg} />}
      </PrimaryContainer>
    </Layout>
  );
}
