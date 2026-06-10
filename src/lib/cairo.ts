import { formatInTimeZone } from "date-fns-tz";

export const CAIRO_TZ = "Africa/Cairo";

export const cairoDate = (d: Date | string = new Date()) =>
  formatInTimeZone(typeof d === "string" ? new Date(d) : d, CAIRO_TZ, "yyyy-MM-dd");

export const cairoTime = (d: Date | string) =>
  formatInTimeZone(typeof d === "string" ? new Date(d) : d, CAIRO_TZ, "HH:mm:ss");

export const genderLabel = (g: number) => (g === 1 ? "Male" : "Female");

export const DEPARTMENTS: { code: number; name: string }[] = [
  { code: 1, name: "Kitchen" },
  { code: 2, name: "House" },
  { code: 3, name: "Bar" },
  { code: 4, name: "Hall" },
  { code: 5, name: "Social Media" },
  { code: 6, name: "Admin" },
  { code: 7, name: "Financial Affairs" },
  { code: 8, name: "Security" },
  { code: 9, name: "Cashier" },
];
