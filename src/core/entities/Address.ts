import { Country } from "./Country";

export interface Address {
  name: string;

  email: string;

  telephoneNumber: string;

  lineOne: string;

  lineTwo?: string;

  lineThree?: string;

  cityTownVillage: string;

  stateProvinceRegion: string;

  zipPostal: string;

  country: Country;
}
