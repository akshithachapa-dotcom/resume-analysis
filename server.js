require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const Database = require("better-sqlite3");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-before-deploying";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, {recursive:true});
const db = new Database(path.join(DATA_DIR, "careerpilot.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS resumes(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, filename TEXT NOT NULL, extracted_text TEXT NOT NULL, skills_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
`);
app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname, "dist")));

const SKILLS = ["Python","Java","JavaScript","TypeScript","HTML","CSS","React","Node.js","SQL","Excel","Power BI","Tableau","Machine Learning","Data Analysis","C","C++","AWS","Azure","Docker","Git","Django","Flask","Linux","Statistics","Communication","Problem Solving","Networking","MongoDB","PostgreSQL","Kubernetes","REST API"];
const JOBS = [
 {id:"frontend",title:"Frontend Developer",company:"Example technology employer",level:"Entry level",skills:["HTML","CSS","JavaScript","React","Git"]},
 {id:"python",title:"Python Developer",company:"Example software employer",level:"Entry level",skills:["Python","SQL","Git","Django","Problem Solving"]},
 {id:"analyst",title:"Data Analyst",company:"Example analytics employer",level:"Entry level",skills:["SQL","Excel","Power BI","Python","Statistics","Data Analysis"]},
 {id:"cloud",title:"Cloud Support Associate",company:"Example cloud employer",level:"Entry level",skills:["AWS","Linux","Networking","Python","Docker"]}
];
function extractSkills(text){const low=text.toLowerCase();return SKILLS.filter(s=>new RegExp(`(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").toLowerCase()}([^a-z0-9+#.]|$)`,"i").test(low));}
function auth(req,res,next){
 const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!token)return res.status(401).json({error:"Please sign in."});
 try{req.user=jwt.verify(token,JWT_SECRET);next();}catch{return res.status(401).json({error:"Session expired. Please sign in again."});}
}
const upload=multer({dest:path.join(DATA_DIR,"uploads"),limits:{fileSize:10*1024*1024},fileFilter:(req,file,cb)=>{
 const ok=/\.(pdf|docx)$/i.test(file.originalname);
 cb(ok?null:new Error("Only PDF and DOCX files are supported."),ok);
}});
app.post("/api/register",async(req,res)=>{
 try{
  const {name,email,password}=req.body||{};
  if(!name||!email||!password||password.length<8)return res.status(400).json({error:"Enter your name, email and a password of at least 8 characters."});
  const hash=await bcrypt.hash(password,12);
  const result=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name.trim(),email.toLowerCase().trim(),hash);
  const user={id:result.lastInsertRowid,name:name.trim(),email:email.toLowerCase().trim()};
  const token=jwt.sign(user,JWT_SECRET,{expiresIn:"7d"});
  res.json({token,user});
 }catch(e){res.status(e.code==="SQLITE_CONSTRAINT_UNIQUE"?409:500).json({error:e.code==="SQLITE_CONSTRAINT_UNIQUE"?"An account with this email already exists.":"Could not create account."});}
});
app.post("/api/login",async(req,res)=>{
 const {email,password}=req.body||{};
 const user=db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase().trim());
 if(!user||!await bcrypt.compare(password||"",user.password_hash))return res.status(401).json({error:"Invalid email or password."});
 const safe={id:user.id,name:user.name,email:user.email};
 res.json({token:jwt.sign(safe,JWT_SECRET,{expiresIn:"7d"}),user:safe});
});
app.get("/api/me",auth,(req,res)=>res.json({user:req.user}));
app.post("/api/resume",auth,upload.single("resume"),async(req,res)=>{
 if(!req.file)return res.status(400).json({error:"Choose a PDF or DOCX resume."});
 let extracted="";
 try{
  const ext=path.extname(req.file.originalname).toLowerCase();
  const buffer=fs.readFileSync(req.file.path);
  if(ext===".pdf"){const parsed=await pdf(buffer);extracted=parsed.text;}
  else{const parsed=await mammoth.extractRawText({buffer});extracted=parsed.value;}
  if(!extracted.trim())throw new Error("No readable text found. Try a text-based PDF or DOCX.");
  const skills=extractSkills(extracted);
  const result=db.prepare("INSERT INTO resumes(user_id,filename,extracted_text,skills_json) VALUES(?,?,?,?)").run(req.user.id,req.file.originalname,extracted,JSON.stringify(skills));
  res.json({resumeId:result.lastInsertRowid,filename:req.file.originalname,skills,educationMentioned:/b\.?tech|bachelor|b\.?sc|degree|university|college/i.test(extracted),experienceMentioned:/intern|experience|worked|years/i.test(extracted),textPreview:extracted.slice(0,900)});
 }catch(e){res.status(422).json({error:e.message||"Could not read this resume."});}
 finally{fs.rmSync(req.file.path,{force:true});}
});
app.get("/api/jobs",auth,(req,res)=>res.json({jobs:JOBS}));
app.post("/api/match",auth,(req,res)=>{
 const resume=db.prepare("SELECT * FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT 1").get(req.user.id);
 if(!resume)return res.status(400).json({error:"Upload and analyze a resume first."});
 const skills=JSON.parse(resume.skills_json);
 const {title,description}=req.body||{};
 if(!description||!description.trim())return res.status(400).json({error:"Paste a job description."});
 const required=extractSkills(description);
 if(!required.length)return res.status(422).json({error:"No recognized skills found in this job description. Include explicit skill names."});
 const matched=required.filter(s=>skills.includes(s)),missing=required.filter(s=>!skills.includes(s));
 res.json({title:title||"Custom role",score:Math.round(matched.length/required.length*100),matched,missing,required});
});
app.get("/api/dashboard",auth,(req,res)=>{
 const resume=db.prepare("SELECT * FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT 1").get(req.user.id);
 const skills=resume?JSON.parse(resume.skills_json):[];
 const gaps=resume?[...new Set(JOBS.flatMap(j=>j.skills))].filter(s=>!skills.includes(s)): [];
 res.json({hasResume:!!resume,filename:resume?.filename||null,skills,skillsCount:skills.length,skillsToDevelop:gaps});
});
app.get("/api/roadmap",auth,(req,res)=>{
 const resume=db.prepare("SELECT * FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT 1").get(req.user.id);
 const skills=resume?JSON.parse(resume.skills_json):[];
 const missing=resume?[...new Set(JOBS.flatMap(j=>j.skills))].filter(s=>!skills.includes(s)).slice(0,8):[];
 const roadmap=[
  {week:"Week 1 — Learn",task:`Study ${missing[0]||"your strongest technical skill"} fundamentals and complete short exercises.`},
  {week:"Week 2 — Build",task:`Create a small project demonstrating ${missing[1]||"problem solving"} and document it.`},
  {week:"Week 3 — Practice",task:"Practice role-specific interview questions and improve resume bullet points with measurable outcomes."},
  {week:"Week 4 — Showcase",task:"Publish a polished portfolio project and apply to relevant entry-level opportunities."}
 ];
 res.json({missingSkills:missing,roadmap});
});
app.get("*",(req,res)=>{
 res.sendFile(path.join(__dirname, "dist", "index.html"));
});
app.use((err,req,res,next)=>res.status(err instanceof multer.MulterError?413:400).json({error:err.message||"Request failed."}));
app.listen(PORT,()=>console.log(`CareerPilot running on port ${PORT}`));
