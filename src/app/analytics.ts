import * as Buyer from "@buyer/Buyer";
import * as Api from "./api";
Buyer.events.on("checkoutComplete", (w, success) => {
  try {
    if (w.task.product) {
      const prod = w.task.product;

      if (prod.product.imageURL) {
        Api.client
          .post("/checkout", {
            store: w.task.group.store,
            success: success,
            productName: prod.product.title,
            price: prod.product.price,
            size: prod.variant.size,
            url: prod.product.url,
            imageUrl: prod.product.imageURL,
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    //
  }
});
