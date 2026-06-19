import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#111116",
        }}
      >
        <div
          style={{
            fontSize: 80,
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
