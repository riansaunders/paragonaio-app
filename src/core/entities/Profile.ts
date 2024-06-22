import { References } from "@core/util/decorators";
import { Ref } from "@core/util/Ref";
import { Address } from "./Address";
import { BaseModel } from "./BaseModel";
import { PaymentCard } from "./PaymentCard";
import { ProfileGroup } from "./ProfileGroup";

import cardValidator from "card-validator";
import * as yup from "yup";
export class Profile extends BaseModel {
  @References(() => ProfileGroup)
  profileGroup!: Ref<ProfileGroup>;

  name!: string;

  singleCheckout: boolean = false;

  address!: Address;

  billingAddress?: Address;

  paymentCard!: PaymentCard;
}

export const ProfileSchema = yup.object().shape({
  name: yup
    .string()

    .required("Profile Name is required"),
  singleCheckout: yup.boolean(),
  address: yup.object().shape({
    name: yup.string().required("A name is required"),
    email: yup.string().email().required("An email is required"),
    telephoneNumber: yup.string().required("A phone number is required"),
    lineOne: yup.string().required("Line one is required"),
    cityTownVillage: yup.string().required("City is required"),
    stateProvinceRegion: yup.string().required("State is required"),
    zipPostal: yup.string().required("Zip/Postal is required"),
    country: yup.string().required("Country is required"),
  }),
  billingAddress: yup
    .object()
    .shape({
      name: yup.string().required("A name is required"),
      email: yup.string().email().required("An email is required"),
      telephoneNumber: yup.string().required("A phone number is required"),
      lineOne: yup.string().required("Line one is required"),
      cityTownVillage: yup.string().required("City is required"),
      stateProvinceRegion: yup.string().required("State is required"),
      zipPostal: yup.string().required("Zip/Postal is required"),
      country: yup.string().required("Country is required"),
    })
    .default(undefined)
    .notRequired(),
  paymentCard: yup.object().shape({
    cardHolder: yup.string().required("Card holder name is required"),
    cardNumber: yup
      .string()
      .test(
        "test-number",
        "Card Number is invalid",
        (value) => cardValidator.number(value).isValid
      )
      .required("Card Number is required"),
    expirationMonth: yup.string().required("Expiration Month is required"),
    expirationYear: yup.string().required("Expiration Year is required"),
    verificationNumber: yup.string().required("CVV is required"),
  }),
});
