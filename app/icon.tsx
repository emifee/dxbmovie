import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#111116", // dark background
          borderRadius: "112px", // Apple-style rounded corners
        }}
      >
        <div
          style={{
            fontSize: 240,
            fontFamily: "sans-serif",
            fontWeight: 800,
            letterSpacing: "-0.05em",
            color: "white",
            display: "flex",
          }}
        >
          DXB
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
