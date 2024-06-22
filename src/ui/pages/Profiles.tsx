import { ProfileGroupModel, ReturnModelType } from "src/dal/DAL";
import { provinces, states } from "@core/util/locales";
import { generateID } from "@core/util/serial";
import { BaseModel } from "@entities/BaseModel";
import { Profile, ProfileSchema } from "@entities/Profile";
import { ProfileGroup } from "@entities/ProfileGroup";
import { Dialog, Switch, Transition } from "@headlessui/react";
import { CreditCardIcon, FolderAddIcon } from "@heroicons/react/outline";
import {
  DownloadIcon,
  DuplicateIcon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@heroicons/react/solid";
import { HighlightTableRowRenderer } from "@ui/components/HighlightTableRowRenderer";
import { Layout } from "@ui/components/Layout";
import { PrimaryContainer } from "@ui/components/PrimaryContainer";
import { SecondaryContainer } from "@ui/components/SecondayContainer";
import { DialogProps } from "@ui/components/SlideOverProps";
import { useDALRecords } from "@ui/utils/hooks";
import cardValidator from "card-validator";
import { ErrorMessage, Field, Form, Formik, useFormikContext } from "formik";
import React, { Fragment, useEffect, useState } from "react";
import {
  AutoSizer,
  Column,
  Table,
  TableCellProps,
  TableRowProps,
} from "react-virtualized";
import * as yup from "yup";
import { ContextMenu, ContextMenuTrigger, MenuItem } from "react-contextmenu";
import { post } from "@ui/utils/renderer-router";

type SidebarProps = {
  selectedId?: string;
  profileGroups?: ReturnModelType<typeof ProfileGroup>[];
  onSelectionClicked?: (id: string) => void;
};

function ProfileGroupSidebar({
  profileGroups,
  selectedId,
  onSelectionClicked,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProfileGroup | undefined>(undefined);

  const openFresh = () => {
    setSelected(undefined);
    setOpen(true);
  };

  const openEdit = (selected?: ProfileGroup) => {
    setSelected(selected);
    setOpen(true);
  };
  return (
    <>
      <div className={"uppercase font-medium pb-2 text-sm text-opacity-30"}>
        Profile groups
        <button
          className={"ml-2 p-1 h-5 w-5 rounded-md uppercase text-xs text-black bg-gray-200 opacity-100 cursor-pointer ".concat(
            !profileGroups?.length ? "hidden" : ""
          )}
          onClick={() => openFresh()}
        >
          <PlusIcon className={"h-full w-full cursor-pointer"} />
        </button>
      </div>
      {!profileGroups?.length && (
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
              Create a new profile group
            </span>
          </button>
        </div>
      )}
      {!!profileGroups?.length && (
        <div className={"h-full overflow-hidden overflow-y-auto w-full"}>
          {profileGroups?.map((tg) => (
            <>
              <ContextMenuTrigger id={`pgc-${tg.id}`} holdToDisplay={-1}>
                <div
                  className={"rounded-md   px-3 py-2  border mb-3  cursor-pointer ".concat(
                    selectedId === tg.id
                      ? "border-[#272727] shadow-md  bg-[#1f1f1f] bg-opacity-50 "
                      : "border-[#272727] hover:border-purple-600 hover:border-opacity-50 select-none "
                  )}
                  onClick={(e) => {
                    if (onSelectionClicked) {
                      onSelectionClicked(tg.id);
                    }
                    if (selectedId === tg.id) {
                      openEdit(tg);
                    }
                  }}
                >
                  <div className={"flex align-center flex-row"}>
                    <FolderIcon
                      className={"h-6 w-6 m-2 text-gray-600 inline "}
                    />
                    <div className={"truncate"}>
                      <span>{tg.name}</span>
                      <div
                        className={"text-sm font-medium text-white opacity-50"}
                      >
                        {tg.profiles.length} Profiles
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
      <ProfileGroupDialog
        open={open}
        setOpen={setOpen}
        profileGroup={selected}
      />
    </>
  );
}

type ProfileGroupDialogProps = DialogProps & {
  profileGroup?: ProfileGroup;
};

type ProfileGroupDetailProps = {
  group: ReturnModelType<typeof ProfileGroup>;
};

function ProfileGroupDetail({ group }: ProfileGroupDetailProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Profile | undefined>(undefined);

  return (
    <>
      <div className={"flex justify-between"}>
        <div>
          <h1 className={"text-xl "}>{group.name}</h1>
          <h4 className={"text-base opacity-50"}>
            {group.profiles.length} Profiles
          </h4>
        </div>
        <div>
          <button
            type="button"
            className=" px-3 py-1.5 shadow-sm max-h-8  bg-white hover:bg-gray-100 text-black text-xs  rounded-md flex items-center "
            onClick={() => {
              setSelected(undefined);
              setDialogOpen(true);
            }}
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Add Profile
          </button>
        </div>
      </div>

      <div
        className={
          "flex flex-row grid-cols divide-x mt-3 uppercase md:gap-3 gap-1 divide-[#272727]"
        }
      >
        <div>
          <button
            type="button"
            className="inline-flex items-center px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md bg-white hover:bg-gray-100 text-black "
            onClick={() => setImportOpen(true)}
          >
            <DownloadIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Import
          </button>
          <button
            type="button"
            className="ml-3 inline-flex items-center px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-[#272727] hover:bg-[#202020]  "
            onClick={() => {
              post("openExportProfiles", {
                group: group.id,
              });
            }}
          >
            <UploadIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Export
          </button>
        </div>

        <div>
          <button
            type="button"
            className="ml-3 inline-flex items-center px-3 py-1.5 border border-transparent  shadow-sm text-xs rounded-md text-white bg-red-600 hover:bg-red-700 "
            onClick={() => {
              group.profiles = [];
              group.save();
            }}
          >
            <TrashIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Delete All
          </button>
        </div>
      </div>
      <div className={"h-[90%] mt-5"}>
        <AutoSizer>
          {({ height, width }) => (
            <Table
              width={width}
              height={height}
              headerHeight={20}
              headerClassName={
                "text-gray-500 py-1 text-left text-xs font-medium  uppercase tracking-wider ml-0"
              }
              headerStyle={{ marginLeft: "0" }}
              rowHeight={30}
              rowCount={group.profiles.length || 0}
              rowGetter={({ index }) => group.profiles[index]}
              // rowClassName={}
              rowRenderer={(props: TableRowProps) => (
                <>
                  <HighlightTableRowRenderer {...props} />
                </>
              )}
            >
              <Column
                label="Profile Name"
                dataKey="name"
                width={250}
                className={"py-1 whitespace-nowrap text-xs font-medium mx-0"}
              />
              <Column
                width={250}
                label="Name"
                dataKey="address.name"
                className={"px-2 py-1 whitespace-nowrap text-xs font-medium"}
                cellRenderer={(props: TableCellProps) => {
                  return <>{props.rowData.address.name}</>;
                }}
              />

              <Column
                label="address"
                dataKey="address.lineOne"
                width={350}
                className={"py-1 whitespace-nowrap text-xs font-medium"}
                cellRenderer={(props: TableCellProps) => {
                  return <>{props.rowData.address.lineOne}</>;
                }}
              />

              <Column
                label="card"
                dataKey="lastFourDigits"
                width={200}
                className={"px-2 py-1 whitespace-nowrap text-xs font-medium"}
                cellRenderer={(props: TableCellProps) => {
                  const cn: string = props.rowData.paymentCard.cardNumber;
                  return <>•••• {cn.slice(cn.length - 4)}</>;
                }}
              />
              <Column
                width={200}
                label="Actions"
                dataKey="id"
                className={"px-2 py-1 whitespace-nowrap text-xs font-medium"}
                cellRenderer={(props: TableCellProps) => {
                  return (
                    <>
                      <button
                        onClick={() => {
                          setSelected(props.rowData);
                          setDialogOpen(true);
                        }}
                      >
                        <PencilIcon
                          className={
                            "bg-[#272727] hover:bg-[#202020] h-6 w-6 p-1 rounded-md"
                          }
                        />
                      </button>
                      <button
                        onClick={() => {
                          const g = Profile.create<Profile>({
                            ...props.rowData,
                            id: generateID(),
                          });
                          group.profiles.push(g);

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
                          group.profiles = group.profiles.filter(
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
      </div>
      <ProfileSlideover
        open={dialogOpen}
        group={group}
        profile={selected}
        setOpen={setDialogOpen}
      />
      <ImportProfileDialog
        open={importOpen}
        profileGroup={group}
        setOpen={setImportOpen}
      />
    </>
  );
}

type ProfileDialogProps = DialogProps & {
  profile?: Profile;
  group: ProfileGroup;
};

type ProfileFormProps = {
  profile?: Profile;
  group: ProfileGroup;
};

function ProfileForm({ profile, group }: ProfileFormProps) {
  const { values, errors, setFieldValue, setValues } = useFormikContext<any>();

  const [isShipping, setIsShipping] = useState(true);
  const [diffBilling, setDiffBilling] = useState(
    profile?.billingAddress ? true : false
  );

  useEffect(() => {
    if (!diffBilling) {
      setFieldValue("billingAddress", undefined);
    }
  }, [diffBilling]);

  useEffect(() => {
    if (profile?.billingAddress) {
      setDiffBilling(true);
    } else {
      setDiffBilling(false);
      setFieldValue("billingAddress", undefined);
    }
    setValues({
      name: profile?.name || "",

      singleCheckout: profile?.singleCheckout || false,
      address: {
        name: profile?.address.name || "",
        email: profile?.address.email || "",
        telephoneNumber: profile?.address.telephoneNumber || "",
        lineOne: profile?.address.lineOne || "",
        lineTwo: profile?.address.lineTwo || "",
        cityTownVillage: profile?.address.cityTownVillage || "",
        stateProvinceRegion: profile?.address.stateProvinceRegion || "",
        zipPostal: profile?.address.zipPostal || "",
        country: profile?.address.country.code || "",
      },
      billingAddress: profile?.billingAddress
        ? {
            name: profile?.billingAddress?.name || "",
            email: profile?.billingAddress?.email || "",
            telephoneNumber: profile?.billingAddress?.telephoneNumber || "",
            lineOne: profile?.billingAddress?.lineOne || "",
            lineTwo: profile?.billingAddress?.lineTwo || "",
            cityTownVillage: profile?.billingAddress?.cityTownVillage || "",
            stateProvinceRegion:
              profile?.billingAddress?.stateProvinceRegion || "",
            zipPostal: profile?.billingAddress?.zipPostal || "",
            country: profile?.billingAddress?.country.code || "",
          }
        : undefined,
      paymentCard: {
        cardNumber: profile?.paymentCard.cardNumber || "",
        cardHolder: profile?.paymentCard.cardHolder || "",
        expirationMonth: profile?.paymentCard.expirationMonth || "",
        expirationYear: profile?.paymentCard.expirationYear || "",
        verificationNumber: profile?.paymentCard.verificationNumber || "",
      },
    });
  }, [profile]);
  return (
    <div className="mt-6 relative flex-1 px-4 overflow-y-auto sm:px-6  ">
      {/* <TaskGroupForm taskGroup={taskGroup} /> */}
      {/* {JSON.stringify(values.address, null, 4)} */}
      {/* {JSON.stringify(errors, null, 4)} */}
      <div>
        <label className="block text-sm font-medium    ">Profile Name</label>
        <div className="mt-1">
          <Field
            name="name"
            className="block w-full shadow-sm pl-3 py-2   rounded-md bg-[#1f1f1f]"
          />
          <ErrorMessage
            name="name"
            className={"text-red-500 text-sm"}
            component={"div"}
          />
        </div>
      </div>
      <div className={"mt-3"}>
        <label className="block text-sm font-medium    ">Card Holder</label>
        <div className="mt-1">
          <Field
            name="paymentCard.cardHolder"
            className="block w-full shadow-sm pl-3 py-2   rounded-md bg-[#1f1f1f]"
          />
          <ErrorMessage
            name="paymentCard.cardHolder"
            className={"text-red-500 text-sm"}
            component={"div"}
          />
        </div>
      </div>
      <div className={"mt-3 relative"}>
        <label className="block text-sm font-medium    ">Card Number</label>
        <div className="mt-1">
          <div className="absolute inset-y-0 left-0 pl-3 pt-6 flex items-center pointer-events-none">
            <CreditCardIcon
              className="h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
          </div>
          <Field
            name="paymentCard.cardNumber"
            className="block w-full shadow-sm pl-10 py-2   rounded-md bg-[#1f1f1f]"
          />
          <ErrorMessage
            name="paymentCard.cardNumber"
            className={"text-red-500 text-sm"}
            component={"div"}
          />
        </div>
      </div>
      <div className={"grid grid-cols-3 mt-3 gap-2"}>
        <div>
          <label className="block text-sm font-medium text-white">
            Expiry Month
          </label>
          <div className="mt-1">
            <Field
              name="paymentCard.expirationMonth"
              as={"select"}
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            >
              <option value={""} />
              {Array.from({ length: 12 }, (_, i) => i + 1).map((v, idx) => (
                <option
                  value={v < 10 ? "0" + v : String(v)}
                  key={v + "_" + idx}
                >
                  {v < 10 ? "0" + v : v}
                </option>
              ))}
            </Field>
            <ErrorMessage
              name="paymentCard.expirationMonth"
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white">
            Expiry Year
          </label>
          <div className="mt-1">
            <Field
              name="paymentCard.expirationYear"
              as={"select"}
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            >
              <option value={""} />

              {Array.from({ length: 21 }, (_, i) => 2021 + i).map((v) => (
                <option value={String(v)}>{v}</option>
              ))}
            </Field>
            <ErrorMessage
              name="paymentCard.expirationYear"
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white">CVV</label>
          <div className="mt-1">
            <Field
              name="paymentCard.verificationNumber"
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name="paymentCard.verificationNumber"
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
      </div>
      <div className={"mt-3"}>
        <div
          className={
            "  group rounded-md flex h-9 flex-shrink  w-46  bg-[#131212] text-gray-500  text-sm"
          }
        >
          <button
            className={"focus-visible:ring-2 px-3 py-1  uppercase focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded-md focus:outline-none focus-visible:ring-offset-gray-100 ".concat(
              isShipping ? "text-white bg-[#1f1f1f] " : " "
            )}
            type="button"
            onClick={(e) => {
              setIsShipping(true);
            }}
          >
            Shipping
          </button>
          <button
            className={" px-3 py-1 uppercase rounded-md flex items-center   ".concat(
              !isShipping ? "text-white bg-[#1f1f1f]" : ""
            )}
            type="button"
            onClick={() => {
              setIsShipping(false);
              setDiffBilling(true);
            }}
          >
            Billing
          </button>
        </div>
      </div>

      {isShipping && <AddressForm prefix={"address"} />}
      {!isShipping && <AddressForm prefix={"billingAddress"} />}
      <div className={"mt-3"}>
        <Switch.Group as="div" className="flex items-center">
          <Switch
            checked={diffBilling}
            onChange={(v) => {
              setIsShipping(!v);
              setDiffBilling(v);
            }}
            className={"relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200  ".concat(
              diffBilling ? "bg-purple-600" : "bg-[#1e1e1e]"
            )}
          >
            <span
              aria-hidden="true"
              className={"pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ".concat(
                diffBilling ? "translate-x-5" : "translate-x-0"
              )}
            />
          </Switch>
          <Switch.Label as="span" className="ml-3">
            <span className="text-sm font-medium">
              Separate billing address{" "}
            </span>
          </Switch.Label>
        </Switch.Group>
        <div className={"mb-2"} />
      </div>
      <div className={"pt-2 border-t border-t-[#272727]"}>
        <div className={"inline-flex content-center"}>
          <Field
            id="singleCheckout"
            name="singleCheckout"
            type={"checkbox"}
            className="bg-[#1f1f1f] focus:ring-purple-600 focus-visible:ring-transparent h-4 w-4   rounded-md "
          />
          <label
            htmlFor={"singleCheckout"}
            className="ml-1 text-xs font-medium select-none"
          >
            Single Checkout
          </label>
        </div>
        <div className={"mb-2"} />
      </div>
    </div>
  );
}

type AddressFormProps = {
  prefix: string;
};

function AddressForm({ prefix }: AddressFormProps) {
  const format = (what: string) => `${prefix}.${what}`;
  const { values } = useFormikContext<any>();
  return (
    <>
      <div className={"mt-3"}>
        <label className="block text-sm font-medium text-white">Name</label>
        <div className="mt-1">
          <Field
            name={format("name")}
            className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
          />
          <ErrorMessage
            name={format("name")}
            className={"text-red-500"}
            component={"div"}
          />
        </div>
      </div>
      <div className={"mt-3"}>
        <label className="block text-sm font-medium text-white">Email</label>
        <div className="mt-1">
          <Field
            name={format("email")}
            className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
          />
          <ErrorMessage
            name={format("email")}
            className={"text-red-500"}
            component={"div"}
          />
        </div>
      </div>
      <div className={"mt-3"}>
        <label className="block text-sm font-medium text-white">
          Phone Number
        </label>
        <div className="mt-1">
          <Field
            name={format("telephoneNumber")}
            className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
          />
          <ErrorMessage
            name={format("telephoneNumber")}
            className={"text-red-500"}
            component={"div"}
          />
        </div>
      </div>
      <div className={"mt-3 grid grid-cols-5 gap-2"}>
        <div className={"col-span-3"}>
          <label className="block text-sm font-medium text-white">
            Country
          </label>
          <div className="mt-1">
            <Field
              name={format("country")}
              as={"select"}
              className="block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            >
              <option value={""} />

              <option value={"US"}>United States</option>
              <option value={"CA"}>Canada</option>
            </Field>
            <ErrorMessage
              name={format("country")}
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
        <div className={"col-span-2"}>
          <label className="block text-sm font-medium text-white">
            {values[prefix]?.country === "US" ? "State" : "Province"}
          </label>
          <div className="mt-1">
            <Field
              name={format("stateProvinceRegion")}
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
              as={"select"}
              disabled={!values[prefix]?.country}
            >
              <option value={""} />

              {values[prefix]?.country === "US"
                ? states.map((s) => (
                    <option value={s.abbreviation}>{s.name}</option>
                  ))
                : provinces.map((s) => (
                    <option value={s.abbreviation}>{s.name}</option>
                  ))}
            </Field>
            <ErrorMessage
              name={format("stateProvinceRegion")}
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
      </div>
      <div className={"mt-3 grid grid-cols-3 gap-2"}>
        <div className={"col-span-2"}>
          <label className="block text-sm font-medium text-white">
            Street Address
          </label>
          <div className="mt-1">
            <Field
              name={format("lineOne")}
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name={format("lineOne")}
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white">
            Address 2
          </label>
          <div className="mt-1">
            <Field
              name={format("lineTwo")}
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name={format("lineTwo")}
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
      </div>
      <div className={"mt-3 grid grid-cols-3 gap-2"}>
        <div className={"col-span-2"}>
          <label className="block text-sm font-medium text-white">City</label>
          <div className="mt-1">
            <Field
              name={format("cityTownVillage")}
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name={format("cityTownVillage")}
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-white">
            {values[prefix]?.country === "US" ? "Zip Code" : "Postal Code"}
          </label>
          <div className="mt-1">
            <Field
              name={format("zipPostal")}
              className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name={format("zipPostal")}
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function ProfileSlideover({
  open,
  setOpen,
  profile,
  group,
}: ProfileDialogProps) {
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
                <div className="h-full flex flex-col py-6 bg-[#131212] shadow-xl overflow-hidden">
                  <div className="px-4 sm:px-6">
                    <div className="flex items-start justify-between">
                      <Dialog.Title className="text-lg font-medium ">
                        {profile ? "Edit" : "Add"} Profile
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
                      name: "",
                      singleCheckout: false,
                      address: {
                        name: "",
                        email: "",
                        telephoneNumber: "",
                        lineOne: "",
                        lineTwo: "",
                        zipPostal: "",
                        cityTownVillage: "",
                        stateProvinceRegion: "AL",
                        country: "US",
                      },
                      billingAddress: {
                        name: "",
                        email: "",
                        telephoneNumber: "",
                        lineOne: "",
                        lineTwo: "",
                        zipPostal: "",
                        cityTownVillage: "",
                        stateProvinceRegion: "AL",
                        country: "US",
                      },
                      paymentCard: {
                        cardHolder: "",
                        cardNumber: "",
                        expirationMonth: "01",
                        expirationYear: "2021",
                        verificationNumber: "",
                      },
                    }}
                    validationSchema={ProfileSchema}
                    onSubmit={(values, helpers) => {
                      helpers.setSubmitting(false);

                      const country = (what: string) =>
                        what === "US"
                          ? {
                              code: "US",
                              name: "United States",
                            }
                          : {
                              code: "CA",
                              name: "Canada",
                            };

                      const pg = ProfileGroupModel.findById(group.id);
                      const p = profile ? profile : new Profile();
                      p.name = values.name;
                      p.singleCheckout = values.singleCheckout;
                      p.paymentCard = values.paymentCard;
                      p.address = {
                        ...values.address,
                        country: country(values.address.country),
                      };
                      p.billingAddress = values.billingAddress
                        ? {
                            ...values.billingAddress,
                            country: country(values.billingAddress.country),
                          }
                        : undefined;
                      p.profileGroup = pg as ProfileGroup;
                      if (!profile) {
                        pg!.profiles.push(p);
                      }
                      pg!.save();

                      setOpen(false);
                    }}
                  >
                    <Form className={"h-full flex flex-col  "}>
                      <ProfileForm profile={profile} group={group} />
                      <div className="flex-shrink-0 px-4 py-4 flex justify-end">
                        <button
                          type="button"
                          className="uppercase bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 hover:bg-gray-50 "
                          onClick={() => setOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          // type="submit"
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

type ImportProfileDialogProps = DialogProps & {
  profileGroup: ProfileGroup;
};

function ImportProfileDialog({
  open,
  profileGroup,
  setOpen,
}: ImportProfileDialogProps) {
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
                  format: "paragon",
                }}
                validationSchema={yup.object().shape({
                  format: yup.string().required(),
                })}
                onSubmit={(values, helpers) => {
                  setOpen(false);
                  post("openImportProfiles", {
                    group: profileGroup.id,
                    format: values.format,
                  });
                }}
              >
                <Form className={"overflow-hidden"}>
                  <div className="w-full">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <div className={"flex justify-between"}>
                        <Dialog.Title
                          as="h3"
                          className="text-lg leading-6 font-medium text-white"
                        >
                          Import Profiles
                        </Dialog.Title>
                      </div>
                      <div className="mt-2 w-full text-white">
                        <div>
                          <label className="block text-sm font-medium">
                            Format
                          </label>
                          <div className="mt-1">
                            <Field
                              name="format"
                              as={"select"}
                              className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
                            >
                              <option value={"paragon"}>Paragon</option>
                              <option value={"voyager"}>Voyager</option>
                            </Field>
                            <ErrorMessage
                              name="format"
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
                        Open
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

function ProfileGroupDialog({
  profileGroup: profileGroup,
  open,
  setOpen,
}: ProfileGroupDialogProps) {
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
                    profileGroup?.name ||
                    `Profile Group ${ProfileGroupModel.all().length + 1}`,
                }}
                validationSchema={yup.object().shape({
                  name: yup.string().required(),
                })}
                onSubmit={(values, helpers) => {
                  if (profileGroup) {
                    const pg = ProfileGroupModel.findById(profileGroup.id);
                    if (pg) {
                      pg.name = values.name;
                      pg.save();
                    }
                  } else {
                    ProfileGroupModel.create({
                      name: values.name,
                    }).save();
                  }
                  setOpen(false);
                }}
              >
                <Form className={"overflow-hidden"}>
                  <div className="w-full">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <div className={"flex justify-between"}>
                        <Dialog.Title
                          as="h3"
                          className="text-lg leading-6 font-medium text-white"
                        >
                          {profileGroup ? "Edit" : "Create"} profile group
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

export default function ProfilesPage() {
  const tgs = useDALRecords<ProfileGroup>(ProfileGroupModel);
  const [selected, setSelected] = useState(tgs[0]?.id);
  const pg = ProfileGroupModel.findById(selected);

  return (
    <Layout>
      <SecondaryContainer>
        <ProfileGroupSidebar
          selectedId={selected}
          // @ts-expect-error
          profileGroups={tgs || []}
          onSelectionClicked={(idx) => {
            setSelected(idx);
          }}
        />
      </SecondaryContainer>
      <PrimaryContainer>
        {pg && <ProfileGroupDetail group={pg} />}
      </PrimaryContainer>
    </Layout>
  );
}
