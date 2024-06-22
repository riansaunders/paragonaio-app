import { serialize } from "@core/util/serial";
import { Profile, ProfileSchema } from "@entities/Profile";
import { dialog } from "electron";
import fs from "fs";
import path from "path";
import { ProfileGroupModel } from "src/dal/DAL";
import { sendMessage, window } from "./main";
import { post } from "./main-router";

post("openImportProfiles", async ({ body }) => {
  const { group, format } = body;
  const pg = ProfileGroupModel.findById(group);

  if (!pg) {
    return;
  }

  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
  });
  if (result.canceled) {
    return false;
  }
  const file = result.filePaths[0];
  try {
    const addressHack = (address: any) => {
      return { ...address, country: address.country.code };
    };
    return new Promise((res) => {
      fs.readFile(file, { encoding: "utf-8" }, (err, data) => {
        let profiles: any[] = JSON.parse(data);
        if (format === "voyager") {
          profiles.forEach((p: any) => {
            p.name = p.title;
            delete p.giftCard;
            delete p.title;
          });
        }

        profiles = profiles.map<Profile>((p: any) =>
          Profile.create<Profile>({
            ...p,

            id: undefined,
            profileGroup: pg,
          })
        );

        const valid = [];
        for (let profile of profiles) {
          try {
            ProfileSchema.validateSync({
              ...profile,
              address: addressHack(profile.address),
              ...(profile.billingAddress
                ? {
                    billingAddress: addressHack(profile.billingAddress),
                  }
                : {}),
            });
          } catch (e) {
            // console.error(e);
            continue;
          }
          valid.push(profile);

          // @ts-ignore
          // pg.profiles.push(profile);
        }

        sendMessage(
          `addProfilesToGroup`,
          serialize({
            group: pg.id,
            profiles: valid,
          })
        );

        res(true);
      });
    });
  } catch (e) {
    return false;
  }
});

post("openExportProfiles", async ({ body }) => {
  const { group } = body;

  const pg = ProfileGroupModel.findById(group);

  if (!pg) {
    return;
  }

  const result = await dialog.showOpenDialog(window, {
    properties: ["openDirectory", "dontAddToRecent"],
  });
  if (result.canceled) {
    return false;
  }
  const folder = result.filePaths[0];
  const profiles = [...pg.profiles];
  profiles.forEach((p) => {
    // @ts-ignore
    delete p.profileGroup;
    // @ts-ignore
    delete p.id;
  });
  return new Promise((res) => {
    fs.writeFile(
      path.join(folder, `${pg.name}.json`),
      JSON.stringify(profiles, null, 4),
      () => res(true)
    );
  });
});
