import { stores } from "@core/util/stores";
import { Platform } from "@entities/Store";
import { TaskGroup } from "@entities/TaskGroup";
import { Form, Field, useFormikContext, ErrorMessage } from "formik";
import React from "react";

type TaskGroupFormProps = {
  taskGroup?: TaskGroup;
};

export function TaskGroupForm({ taskGroup }: TaskGroupFormProps) {
  const { values, errors } = useFormikContext<any>();

  const store = stores.find((s) => s.url === values.store);

  const isCustom = !store || values.store === "custom";

  const isShopify = (store && store?.platform === Platform.Shopify) || isCustom;

  return (
    <>
      <div className="mt-6 relative flex-1 px-4 sm:px-6  ">
        <div>
          <label className="block text-sm font-medium    ">Name</label>
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
          <label className="block text-sm font-medium text-white">Store</label>
          <div className="mt-1">
            <Field
              name="store"
              as="select"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base  rounded-md bg-[#1f1f1f]"
            >
              {stores.map((s) => (
                <option key={`store-${s.url}`} value={s.url}>
                  {s.name}
                </option>
              ))}
              <option value={"custom"}>Custom</option>
            </Field>
            <ErrorMessage
              name="store"
              className={"text-red-500"}
              component={"div"}
            />
          </div>
        </div>
        {isCustom && (
          <div className={"grid grid-cols-3 mt-3 gap-2"}>
            <div>
              <label className="block text-sm font-medium text-white">
                Name
              </label>
              <div className="mt-1">
                <Field
                  name="storeName"
                  className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
                />
                <ErrorMessage
                  name="storeName"
                  className={"text-red-500"}
                  component={"div"}
                />
              </div>
            </div>
            <div className={"col-span-2"}>
              <label className="block text-sm font-medium text-white">
                Url
              </label>
              <div className="mt-1">
                <Field
                  name="storeUrl"
                  className="mt-1 block w-full px-3 py-2 text-base  rounded-md bg-[#1f1f1f]"
                />
                <ErrorMessage
                  name="storeUrl"
                  className={"text-red-500"}
                  component={"div"}
                />
              </div>
            </div>
          </div>
        )}
        {isShopify && (
          <div className={"mt-3"}>
            <div>
              <label className="block text-sm font-medium text-white">
                Password
              </label>
              <div className="mt-1">
                <Field
                  name="storePassword"
                  className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
                />
              </div>
            </div>
            <div className={"grid grid-cols-2 mt-3 gap-2"}>
              <div>
                <label className="block text-sm font-medium text-white">
                  Retry
                </label>
                <div className="mt-1">
                  <Field
                    name="retryDelay"
                    type="number"
                    className="mt-1 block w-full px-3  py-2 text-base  rounded-md bg-[#1f1f1f]"
                  />
                  <ErrorMessage
                    name="retryDelay"
                    className={"text-red-500"}
                    component={"div"}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white">
                  Timeout
                </label>
                <div className="mt-1">
                  <Field
                    name="timeout"
                    type="number"
                    className="mt-1 block w-full px-3 py-2 text-base  rounded-md bg-[#1f1f1f]"
                  />
                  <ErrorMessage
                    name="timeout"
                    className={"text-red-500"}
                    component={"div"}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
