export interface RequestInit {
  type: 'init'
  tsconfig?: string
}

export interface RequestCheck {
  type: 'check'
  files: string[]
}

export interface RequestDependencies {
  type: 'dependencies'
  files: string[]
}

export interface RequestDestroy {
  type: 'destroy'
}

export type RequestType = RequestInit | RequestCheck | RequestDependencies | RequestDestroy

export type Request = RequestType & {
  id: number
}

export interface Response {
  id: number
  result: any
  error: boolean
}
