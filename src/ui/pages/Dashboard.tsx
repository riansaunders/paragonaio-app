import { BuyerTask } from "@entities/BuyerTask";
import { CompletedBuyer } from "@entities/CompletedBuyer";
import { QuestionMarkCircleIcon } from "@heroicons/react/solid";
import { HighlightTableRowRenderer } from "@ui/components/HighlightTableRowRenderer";
import { Layout } from "@ui/components/Layout";
import { PrimaryContainer } from "@ui/components/PrimaryContainer";
import { useDALRecords } from "@ui/utils/hooks";
import React, { useState } from "react";
import {
  AutoSizer,
  Column,
  Table,
  TableCellProps,
  TableRowProps,
} from "react-virtualized";
import { CompletedBuyerModel } from "src/dal/DAL";

export default function Dashboard() {
  const [showSuccess, setShowSuccess] = useState(true);

  const purchases = useDALRecords<CompletedBuyer>(CompletedBuyerModel);

  const success = purchases.filter((c) => c.success).reverse();
  const declines = purchases.filter((c) => !c.success).reverse();

  return (
    <Layout>
      <PrimaryContainer>
        <div className={"mb-3"}>
          <dl className=" grid grid-cols-1 rounded-md bg-[#131212] border-[#202020] overflow-hidden shadow-md divide-y divide-[#272727] md:grid-cols-3 md:divide-y-0 md:divide-x">
            {/* {stats.map((item) => ( */}
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-base font-normal 0">Total Spent</dt>
              <dd className="mt-1 flex justify-between items-baseline md:block lg:flex">
                <div className="flex items-baseline text-2xl font-semibold text-yellow-400">
                  $
                  {success
                    .filter(
                      (p) => p.product.price && !isNaN(Number(p.product.price))
                    )
                    .map((p) => Number(p.product.price!))
                    .reduce((p, v) => p + v, 0)}
                </div>
              </dd>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-base font-normal 0">Checkouts</dt>
              <dd className="mt-1 flex justify-between items-baseline md:block lg:flex">
                <div className="flex items-baseline text-2xl font-semibold text-green-600">
                  {success.length}
                </div>
              </dd>
            </div>
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-base font-normal 0">Declines</dt>
              <dd className="mt-1 flex justify-between items-baseline md:block lg:flex">
                <div className="flex items-baseline text-2xl font-semibold text-red-600">
                  {purchases.filter((c) => !c.success).length}
                </div>
              </dd>
            </div>
            {/* ))} */}
          </dl>
        </div>
        <div className={"flex flex-row mb-3 justify-end"}>
          <div
            className={
              " justify-center group p-1 rounded-md flex h-9 flex-shrink  w-46  bg-[#131212] text-gray-500  text-sm"
            }
          >
            <button
              className={"focus-visible:ring-2 px-3 py-1 text-xs  uppercase focus-visible:ring-teal-500 focus-visible:ring-offset-2 rounded-md focus:outline-none focus-visible:ring-offset-gray-100 ".concat(
                showSuccess ? "text-white bg-[#1f1f1f] " : " "
              )}
              onClick={() => {
                setShowSuccess(true);
              }}
            >
              Checkouts
            </button>
            <button
              className={" px-3 py-1 uppercase rounded-md text-xs flex items-center   ".concat(
                !showSuccess ? "text-white bg-[#1f1f1f]" : ""
              )}
              onClick={() => setShowSuccess(false)}
            >
              Declines
            </button>
          </div>
        </div>

        <div className={"flex flex-grow flex-col"}>
          <AutoSizer>
            {({ height, width }) => (
              <Table
                width={width}
                height={height}
                headerHeight={20}
                headerClassName={
                  "text-gray-500 py-1 text-left text-xs font-medium  uppercase tracking-wider ml-0"
                }
                overscanRowCount={0}
                data={showSuccess ? success : declines}
                headerStyle={{ marginLeft: "0" }}
                rowHeight={47}
                rowCount={showSuccess ? success.length : declines.length}
                rowGetter={({ index }) =>
                  showSuccess ? success[index] : declines[index]
                }
                // rowClassName={}
                rowRenderer={(props: TableRowProps) => (
                  <HighlightTableRowRenderer {...props} />
                )}
              >
                <Column
                  label="Product"
                  dataKey="product"
                  width={450}
                  className={" py-1 whitespace-nowrap text-xs font-medium ml-0"}
                  // flexShrink={0}

                  cellRenderer={(props: TableCellProps) => {
                    // console.log("rowData", props.rowData.constructor.name);
                    const task: CompletedBuyer = props.rowData;
                    const { product } = task;
                    return (
                      <>
                        {!product.imageURL && (
                          <QuestionMarkCircleIcon
                            className={
                              "h-9 w-9 p-1 inline mr-2 text-gray-200  rounded-md border-[#272727] border-2 "
                            }
                          />
                        )}
                        {product.imageURL && (
                          <img
                            src={product.imageURL}
                            className={
                              "h-9 w-9 inline mr-2  text-gray-200  rounded-md  "
                            }
                          />
                        )}
                        {product.title}
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
                    return <>{props.rowData.product?.size}</>;
                  }}
                />
                <Column
                  width={250}
                  label="Price"
                  dataKey="id"
                  className={" py-1 whitespace-nowrap text-xs font-medium"}
                  cellRenderer={(props: TableCellProps) => {
                    return <>{props.rowData.product?.price || "0"}</>;
                  }}
                />
                <Column
                  width={250}
                  label="Store"
                  dataKey="id"
                  className={" py-1 whitespace-nowrap text-xs font-medium"}
                  cellRenderer={(props: TableCellProps) => {
                    return <>{props.rowData.store?.name}</>;
                  }}
                />
                <Column
                  width={250}
                  label="Date"
                  dataKey="id"
                  className={" py-1 whitespace-nowrap text-xs font-medium"}
                  cellRenderer={(props: TableCellProps) => {
                    return (
                      <>{new Date(Number(props.rowData.date)).toDateString()}</>
                    );
                  }}
                />
              </Table>
            )}
          </AutoSizer>
        </div>
      </PrimaryContainer>
    </Layout>
  );
}
