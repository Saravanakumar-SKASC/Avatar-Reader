/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist', '@huggingface/transformers', 'onnxruntime-node'],
  },
};

export default nextConfig;
