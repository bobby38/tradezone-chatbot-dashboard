import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const params = await request.json();
    const apiHost = request.headers.get("host");
    const protocol = apiHost?.startsWith("localhost") ? "http" : "https";
    const apiUrl = `${protocol}://${apiHost}`;

    const response = await fetch(`${apiUrl}/api/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content_type: "Chat Submission",
        sender_email: params.email,
        sender_name: params.name,
        message: params.message,
        source: "chatkit-voice",
        ai_metadata: {
          email_type: params.emailType,
          device_model: params.deviceModel,
          device_condition: params.deviceCondition,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Email submission error:", error);
      throw new Error(
        `Failed to send email: ${error.error || "Unknown error"}`,
      );
    }

    let result;
    if (params.emailType === "trade_in") {
      result = `Thanks, ${params.name}! I've sent your trade-in request for the ${params.deviceModel} to our team. They'll email you at ${params.email} with a quote within 24 hours.`;
    } else {
      result = `Thanks, ${params.name}! I've passed your inquiry to our team. They'll respond to ${params.email} shortly.`;
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Error sending email:", error);
    const result =
      "I encountered an error submitting your request. Please try contacting us directly at contactus@tradezone.sg or call +65 6123 4567.";
    return NextResponse.json({ result }, { status: 500 });
  }
}
