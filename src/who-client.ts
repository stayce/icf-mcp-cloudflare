/**
 * WHO ICD-API Client for ICF (International Classification of Functioning, Disability and Health)
 * 
 * This module handles authentication and API calls to the WHO ICD-API to access ICF data.
 * API Documentation: https://icd.who.int/docs/icd-api/APIDoc-Version2/
 */

// WHO ICD-API endpoints
const TOKEN_ENDPOINT = "https://icdaccessmanagement.who.int/connect/token";
const API_BASE_URL = "https://id.who.int";
const ICF_LINEARIZATION = "icf";

export interface ICFEntity {
  code: string;
  title: string;
  definition?: string;
  inclusions?: string[];
  exclusions?: string[];
  parent?: string;
  children?: string[];
  uri?: string;
}

export interface ICFSearchResult {
  code: string;
  title: string;
  score: number;
  uri: string;
}

export interface WHOClientConfig {
  clientId: string;
  clientSecret: string;
  release?: string;
  language?: string;
}

export class WHOICFClient {
  private clientId: string;
  private clientSecret: string;
  private release: string;
  private language: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: WHOClientConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.release = config.release || "2025-01";
    this.language = config.language || "en";
  }

  /**
   * Authenticate with the WHO ICD-API using OAuth2 client credentials
   */
  private async authenticate(): Promise<void> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "icdapi_access",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Authentication failed: ${response.status} - ${text}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    // Set expiry 5 minutes before actual expiry to be safe
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
    return this.accessToken!;
  }

  /**
   * Make an authenticated API request
   */
  private async apiRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const token = await this.ensureToken();
    
    let url = `${API_BASE_URL}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Accept-Language": this.language,
        "API-Version": "v2",
      },
    });

    if (response.status === 401) {
      // Token expired, re-authenticate and retry
      this.accessToken = null;
      return this.apiRequest(endpoint, params);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API request failed: ${response.status} - ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get the root of the ICF classification
   */
  async getICFRoot(): Promise<Record<string, unknown>> {
    return this.apiRequest(`/icd/release/11/${this.release}/${ICF_LINEARIZATION}`);
  }

  /**
   * Get an ICF entity by its code
   */
  async getEntityByCode(code: string): Promise<ICFEntity | null> {
    // First use codeinfo to get the stemId for this code
    const codeinfoEndpoint = `/icd/release/11/${this.release}/${ICF_LINEARIZATION}/codeinfo/${code}`;

    try {
      const codeinfo = await this.apiRequest<{ stemId?: string }>(codeinfoEndpoint);
      if (!codeinfo.stemId) {
        console.warn(`No stemId found for ICF code ${code}`);
        return null;
      }

      // Fetch the full entity using the stemId
      return this.getEntityByUri(codeinfo.stemId);
    } catch (error) {
      console.warn(`Failed to get ICF entity ${code}:`, error);
      return null;
    }
  }

  /**
   * Get an ICF entity by its URI
   */
  async getEntityByUri(uri: string): Promise<ICFEntity | null> {
    // Convert URI to endpoint path
    let cleanUri = uri;
    if (cleanUri.startsWith("http://")) {
      cleanUri = cleanUri.replace("http://", "https://");
    }
    
    const endpoint = cleanUri.replace(API_BASE_URL, "");
    
    try {
      const data = await this.apiRequest<Record<string, unknown>>(endpoint);
      return this.parseEntity(data);
    } catch (error) {
      console.warn(`Failed to get ICF entity by URI ${uri}:`, error);
      return null;
    }
  }

  /**
   * Search the ICF classification
   */
  async search(query: string, maxResults: number = 10): Promise<ICFSearchResult[]> {
    const endpoint = `/icd/release/11/${this.release}/${ICF_LINEARIZATION}/search`;
    const params = {
      q: query,
      useFlexisearch: "true",
      flatResults: "true",
      highlightingEnabled: "false",
    };

    const data = await this.apiRequest<{ destinationEntities?: Array<{
      theCode?: string;
      title?: string;
      score?: number;
      id?: string;
    }> }>(endpoint, params);

    const results: ICFSearchResult[] = [];
    const entities = data.destinationEntities || [];
    
    for (const item of entities.slice(0, maxResults)) {
      results.push({
        code: item.theCode || "",
        title: item.title || "",
        score: item.score || 0,
        uri: item.id || "",
      });
    }

    return results;
  }

  /**
   * Get child entities of an ICF code
   */
  async getChildren(code: string): Promise<ICFEntity[]> {
    const entity = await this.getEntityByCode(code);
    if (!entity || !entity.children) {
      return [];
    }

    const children: ICFEntity[] = [];
    for (const childUri of entity.children) {
      const child = await this.getEntityByUri(childUri);
      if (child) {
        children.push(child);
      }
    }

    return children;
  }

  /**
   * Browse a top-level ICF category
   */
  async browseCategory(category: string): Promise<{
    category: string;
    name: string;
    description: string;
    results: ICFSearchResult[];
  }> {
    const categoryMap: Record<string, string> = {
      b: "Body Functions",
      s: "Body Structures",
      d: "Activities and Participation",
      e: "Environmental Factors",
    };

    const cat = category.toLowerCase();
    if (!(cat in categoryMap)) {
      throw new Error(
        `Invalid category '${category}'. Must be one of: ${Object.keys(categoryMap).join(", ")}`
      );
    }

    const results = await this.search(categoryMap[cat], 20);

    return {
      category: cat,
      name: categoryMap[cat],
      description: this.getCategoryDescription(cat),
      results,
    };
  }

  /**
   * Get description for an ICF category
   */
  private getCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
      b: "Body Functions are the physiological functions of body systems (including psychological functions). Codes range from b1 to b8.",
      s: "Body Structures are anatomical parts of the body such as organs, limbs and their components. Codes range from s1 to s8.",
      d: "Activities and Participation covers the execution of tasks and involvement in life situations. Codes range from d1 to d9.",
      e: "Environmental Factors make up the physical, social and attitudinal environment in which people live. Codes range from e1 to e5.",
    };
    return descriptions[category] || "";
  }

  /**
   * Parse API response into an ICFEntity
   */
  private parseEntity(data: Record<string, unknown>): ICFEntity {
    // Extract code
    const code = (data.code as string) || (data.theCode as string) || "";

    // Get title - handle different response formats
    let title = data.title;
    if (typeof title === "object" && title !== null) {
      title = (title as Record<string, unknown>)["@value"] || JSON.stringify(title);
    }

    // Get definition
    let definition = data.definition;
    if (typeof definition === "object" && definition !== null) {
      definition = (definition as Record<string, unknown>)["@value"];
    }

    // Get inclusions
    let inclusions: string[] | undefined;
    if (Array.isArray(data.inclusion)) {
      inclusions = data.inclusion.map((i: unknown) => {
        if (typeof i === "object" && i !== null) {
          const label = (i as Record<string, unknown>).label;
          if (typeof label === "object" && label !== null) {
            return (label as Record<string, unknown>)["@value"] as string || JSON.stringify(i);
          }
        }
        return String(i);
      });
    }

    // Get exclusions
    let exclusions: string[] | undefined;
    if (Array.isArray(data.exclusion)) {
      exclusions = data.exclusion.map((e: unknown) => {
        if (typeof e === "object" && e !== null) {
          const label = (e as Record<string, unknown>).label;
          if (typeof label === "object" && label !== null) {
            return (label as Record<string, unknown>)["@value"] as string || JSON.stringify(e);
          }
        }
        return String(e);
      });
    }

    // Get parent
    let parent: string | undefined;
    if (Array.isArray(data.parent) && data.parent.length > 0) {
      parent = data.parent[0] as string;
    } else if (typeof data.parent === "string") {
      parent = data.parent;
    }

    // Get children
    let children: string[] | undefined;
    if (Array.isArray(data.child)) {
      children = data.child as string[];
    } else if (typeof data.child === "string") {
      children = [data.child];
    }

    return {
      code,
      title: String(title || ""),
      definition: definition ? String(definition) : undefined,
      inclusions,
      exclusions,
      parent,
      children,
      uri: (data["@id"] as string) || (data.id as string) || undefined,
    };
  }
}
