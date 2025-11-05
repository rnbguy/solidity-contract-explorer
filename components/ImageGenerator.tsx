
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('A photorealistic image of a majestic lion in the savanna at sunset, with a dramatic sky');
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');

  const generateImages = async () => {
    if (!prompt) {
      setError('Please enter a prompt.');
      return;
    }
    if (!process.env.API_KEY) {
      setError("API_KEY environment variable not set.");
      return;
    }
    
    setIsLoading(true);
    setError('');
    setImages([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: aspectRatio,
        },
      });
      
      const generatedImages = response.generatedImages.map(
        (img) => `data:image/jpeg;base64,${img.image.imageBytes}`
      );
      setImages(generatedImages);
    } catch (e: any) {
      setError(e.message || 'An error occurred while generating the image.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-white">Imagen 4.0 Image Generator</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1">
              Enter your creative prompt
            </label>
            <textarea
              id="prompt"
              rows={3}
              className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A futuristic city on Mars..."
            />
          </div>

          <div>
            <label htmlFor="aspectRatio" className="block text-sm font-medium text-gray-300 mb-1">
              Aspect Ratio
            </label>
            <select
              id="aspectRatio"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as any)}
              className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="1:1">1:1 (Square)</option>
              <option value="16:9">16:9 (Widescreen)</option>
              <option value="9:16">9:16 (Portrait)</option>
              <option value="4:3">4:3 (Standard)</option>
              <option value="3:4">3:4 (Tall)</option>
            </select>
          </div>

          <button
            onClick={generateImages}
            disabled={isLoading}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2.5 px-4 rounded-md transition-all duration-300 ease-in-out disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              'Generate Image'
            )}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-4 bg-red-900/50 p-3 rounded-md">{error}</p>}
      </div>

      <div className="mt-8">
        {isLoading && (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-gray-800/50 rounded-lg">
             <div className="animate-pulse">
                <div className="w-64 h-64 bg-gray-700 rounded-lg"></div>
             </div>
             <p className="mt-4 text-gray-300">Generating your masterpiece, please wait...</p>
          </div>
        )}
        {images.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {images.map((imgSrc, index) => (
              <div key={index} className="bg-gray-800 p-2 rounded-lg border border-gray-700">
                <img src={imgSrc} alt={`Generated image ${index + 1}`} className="rounded-md w-full object-contain" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenerator;
