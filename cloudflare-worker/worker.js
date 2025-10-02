/**
 * Cloudflare Worker - AssemblyAI Token Proxy
 *
 * This worker securely generates temporary AssemblyAI tokens
 * without exposing your API key in the frontend.
 *
 * Deploy once, use forever!
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }

    try {
      // Get temporary token from AssemblyAI (v3 Universal Streaming)
      const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600', {
        method: 'GET',
        headers: {
          'Authorization': env.ASSEMBLYAI_API_KEY,
        },
      })

      if (!response.ok) {
        throw new Error(`AssemblyAI API error: ${response.statusText}`)
      }

      const data = await response.json()

      // Return token with CORS headers
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      })
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }
  },
}
