import {
  Fastest,
  FastMode,
  SafeMode,
  SafePreload,
} from "@buyer/worker/task-flags";
import { insensitiveFilter } from "@core/util/helpers";
import { sizes } from "@core/util/locales";
import { Platform } from "@entities/Store";
import { TaskGroup } from "@entities/TaskGroup";
import { XIcon } from "@heroicons/react/outline";
import { ErrorMessage, Field, useFormikContext } from "formik";
import React, { useEffect } from "react";
import MultiSelect from "react-multi-select-component";
import {
  AccountGroupModel,
  ProfileGroupModel,
  ProxyGroupModel,
} from "src/dal/DAL";

type BuyerFormProps = {
  taskGroup: TaskGroup;
  isAdding?: boolean;
};

export function BuyerFormAdvanced({ taskGroup }: BuyerFormProps) {
  const { values } = useFormikContext<any>();

  return (
    <div className="mt-2 w-full text-white">
      <div className={"mt-3"}>
        <label className="block text-sm font-medium ">Mode</label>
        <div className="mt-1">
          <Field
            name="flags"
            as="select"
            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
          >
            <option value={String(SafeMode)}>Safe</option>
            <option value={String(SafePreload)}>Safe Preload</option>
            <option value={String(FastMode)}>Fast</option>
            {/* <option value={String(Fastest)}>Fastest</option> */}
          </Field>
          <ErrorMessage
            name="flags"
            className={"text-red-500 text-sm"}
            component={"div"}
          />
        </div>
      </div>
      <div className={"mt-3"}>
        <label className="block text-sm font-medium  ">Account Group</label>
        <div className="mt-1">
          <Field
            name="accountGroup"
            as="select"
            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
          >
            <option value={""}>None</option>

            {AccountGroupModel.all()
              .filter((a) => a.accounts.length > 0)
              .map((p) => (
                <option key={`pxg-${p.id}`} value={p.id}>
                  {p.name} ({p.accounts.length} Accounts)
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
      <div className={"mt-3"}>
        {/* <>{JSON.stringify(values, null, 4)}</> */}
        <label className="block text-sm font-medium">Shipping Rate</label>
        <div className="mt-1">
          <Field
            name="shippingRate"
            className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
          />
          <ErrorMessage
            name="shippingRate"
            className={"text-red-500 text-sm"}
            component={"div"}
          />
        </div>
      </div>
    </div>
  );
}

export function BuyerForm({ taskGroup, isAdding: isAdding }: BuyerFormProps) {
  const { values, errors, setFieldValue, handleChange } =
    useFormikContext<any>();

  useEffect(() => {
    if (!isAdding) {
      setFieldValue(
        "profile",
        values.profile || values.profileGroup
          ? ProfileGroupModel.first()?.profiles[0]?.id ?? ""
          : ""
      );
    }
    if (values.profile) {
      setFieldValue("profile", values.profile);
    }
  }, [values.profileGroup]);

  return (
    <div className="mt-2 w-full text-white ">
      <div className={"grid grid-cols-2 gap-2"}>
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
        <div>
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
        </div>
      </div>
      <div className={"grid grid-cols-2 mt-3 gap-2"}>
        <div>
          <label className="block text-sm font-medium    ">Profile Group</label>
          <div className="mt-1">
            <Field
              name="profileGroup"
              as="select"
              className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
            >
              {ProfileGroupModel.all()
                .filter((pg) => pg.profiles.length > 0)
                .map((p) => (
                  <option key={`pg-${p.id}`} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Field>
            <ErrorMessage
              name="profileGroup"
              className={"text-red-500 text-sm"}
              component={"div"}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">Profile</label>
          <div className="mt-1">
            <Field
              name="profile"
              as="select"
              className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
            >
              {isAdding && values.profileGroup && (
                <option value={""}>All</option>
              )}
              {!isAdding && <option value={""}></option>}

              {ProfileGroupModel.findById(values.profileGroup)?.profiles.map(
                (p) => (
                  <option key={`pf-${p.id}`} value={p.id}>
                    {p.name}
                  </option>
                )
              )}
            </Field>
            <ErrorMessage
              name="profile"
              className={"text-red-500 text-sm"}
              component={"div"}
            />
          </div>
        </div>
      </div>
      <div className={"mt-3"}>
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
      {isAdding && (
        <div className={"mt-3"}>
          <label className="block text-sm font-medium">Count</label>
          <div className="mt-1">
            <Field
              name="count"
              type="number"
              className="block w-full shadow-sm pl-3 py-2 focus-visible:ring-transparent   rounded-md bg-[#1f1f1f]"
            />
            <ErrorMessage
              name="count"
              className={"text-red-500 text-sm"}
              component={"div"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
