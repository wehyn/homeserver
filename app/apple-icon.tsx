import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        borderRadius: 45,
        background: "#0c0e13",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 39,
          left: 20,
          width: 101,
          height: 101,
          borderRadius: "50%",
          background: "#65e6a5",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 39,
          left: 59,
          width: 101,
          height: 101,
          borderRadius: "50%",
          background: "#80d6ff",
          opacity: 0.86,
        }}
      />
    </div>,
    size,
  );
}
