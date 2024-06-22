import { ProductDetails } from "@entities/ProductDetails";
import { Store } from "@entities/Store";
import axios from "axios";
import Discord from "discord.js";
import { post } from "./main-router";

export interface RestockWebhookProps {
  webhookURL: string;
  storeName: string;
  monitor: string;
  groupNames: string[];
  imageURL?: string;
}
export async function testWebhook(webhookURL: string) {
  const embed = {
    username: "ParagonAIO",
    avatar_url: "https://paragonaio.com/logo.png",

    embeds: [
      new Discord.MessageEmbed()
        .setAuthor("Test Webhook")
        .setFooter(
          `Brought to you by ParagonAIO | ${new Date().toString()}`,
          "https://paragonaio.com/logo.png"
        )
        .setColor("PURPLE")
        .setURL("https://paragonaio.com")

        .toJSON(),
    ],
  };
  axios
    .post(webhookURL, embed)
    // .then((r) => console.log(r.data))
    .catch((e) => {});

  return true;
}

async function postItemWebhook(
  title: string,
  color: Discord.ColorResolvable,
  { webhookURL, profileName, proxyGroupName, details, store }: ItemWebhookProps
) {
  const de = new Discord.MessageEmbed()
    .setTitle(title)
    .addField("Product", `[${details.product.title}](${details.product.url})`)
    .addField("SKU", details.product.id || "?")
    .addField("Store", `[${store.name}](${store.url})`)
    .addField("Size", details.variant.size || "?", true)
    .addField("Price", details.product.price || "?", true);
  if (details.variant.color) {
    de.addField("Color", details.variant.color || "?");
  }

  de.addField("Profile", `||${profileName}||`, true);

  if (proxyGroupName) {
    de.addField("Proxy", proxyGroupName, true);
  }
  const date = new Date();

  de.setFooter(
    `Brought to you by ParagonAIO | ${date.toString()}`,
    "https://paragonaio.com/logo.png"
  ).setColor(color);
  if (details.product.url) {
    de.setURL(details.product.url);
  }
  if (details.variant.imageURL) {
    de.setThumbnail(details.variant.imageURL);
  } else if (details.product.imageURL) {
    de.setThumbnail(details.product.imageURL);
  }
  // de.setTimestamp(new Date());
  const embed = {
    username: "ParagonAIO",
    avatar_url: "https://paragonaio.com/logo.png",
    embeds: [de],
  };
  axios
    .post(webhookURL, embed)
    // .then((r) => console.log(r.data))
    .catch((e) => {});
}

export interface ItemWebhookProps {
  webhookURL: string;
  details: ProductDetails;
  profileName: string;
  store: Store;
  proxyGroupName?: string;
}

export function postAutomationNotification({
  webhookURL,
  storeName,
  monitor,
  groupNames,
  imageURL,
}: RestockWebhookProps) {
  if (!groupNames.length) {
    return;
  }

  const de = new Discord.MessageEmbed()
    .setTitle("Automation Started")

    .addField("Store", storeName, true)
    .addField("Monitor", monitor, true)
    .addField("Group(s)", groupNames.join(", "))
    .setColor("BLUE")

    .setFooter(new Date().toString(), "https://paragonaio.com/logo.png");
  if (imageURL) {
    de.setThumbnail(imageURL);
  }
  de.setTimestamp(new Date());
  const embed = {
    username: "ParagonAIO",
    avatar_url: "https://paragonaio.com/logo.png",
    embeds: [de],
  };
  axios
    .post(webhookURL, embed)
    // .then((r) => console.log(r.data))
    .catch((e) => {});
}

export async function postSuccess(props: ItemWebhookProps) {
  return postItemWebhook("Paragon Checkout", "GREEN", props);
}

export async function postCartNotificationsToHook(props: ItemWebhookProps) {
  return postItemWebhook("Paragon Cart", "YELLOW", props);
}

export async function postDecline(props: ItemWebhookProps) {
  return postItemWebhook("Paragon Decline", "RED", props);
}

post("testWebhook", async (req) => {
  const { webhook } = req.body;
  if (webhook) {
    testWebhook(webhook);
  }
});
