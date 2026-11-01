// Data shapes shared by more than one module. Keep this file small: a type belongs here only
// when two modules read or write the same stored data.

/** A job posting created on post-job (recruiting) and listed on the jobs page (jobs). Stored under `demo:jobs`. */
export type DemoJob={id:string;title:string;status:string;department:string;location:string;description:string;fields?:Record<string,string|boolean>};
