export interface RequestInit {
  type: 'init'
  tsconfig?: string
}

export interface RequestCheck {
  type: 'check'
  files: string[]
}

export interface RequestFlush {
  type: 'flush'
}

export type RequestType = RequestInit | RequestCheck | RequestFlush

export type Request = RequestType & {
  id: number
}

export interface Response {
  id: number
  result: any
  error: boolean
}
