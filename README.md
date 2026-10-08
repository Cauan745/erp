# Stockroom ERP MVP

An Expo + React Native + TypeScript local-first ERP slice.

## Included

- Local product catalogue backed by SQLite on the device.
- Barcode scanning with `react-native-vision-camera` for EAN/UPC/Code 128 formats.
- Product lookup, add-to-cart, quantity changes, and cash checkout.
- Local sales history and stock decrement after checkout, with an explicit override for negative stock.
- A path for non-barcode products: products can be created without a barcode.

## Run it

```bash
npm install
npx expo prebuild
npx expo run:ios     # or: npx expo run:android
```

VisionCamera needs a native development build; the scanner will not work in the standard Expo Go client. The app can still be run on web for UI work, but camera support is native-only.

## Storage note

The MVP uses Expo SQLite directly. Products and sales are stored locally, and checkout writes stock changes and sale records in one transaction. The backend and replication layer are intentionally not included yet.

## Next slice

Add a backend sync adapter for products and sales, conflict rules for simultaneous product edits, user/device identity, and camera-based object recognition for products without barcodes.
