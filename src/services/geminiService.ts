import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export async function generateMenuItemImage(itemName: string): Promise<string | null> {
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not defined");
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `A professional, high-quality food photography shot of ${itemName}. The image should be appetizing, well-lit, and suitable for a hospitality service menu. Centered composition, clean background.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        return `data:image/png;base64,${base64EncodeString}`;
      }
    }

    return null;
  } catch (error) {
    console.error("Error generating image with Gemini:", error);
    return null;
  }
}
