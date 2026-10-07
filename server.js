const express=require("express");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const {Pool}=require("pg");
const OpenAI=require("openai");
const path=require("path");
const app=express();

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

const DATABASE_URL=process.env.DATABASE_URL;
const JWT_SECRET=process.env.JWT_SECRET;
const OPENAI_API_KEY=process.env.OPENAI_API_KEY;

if(!DATABASE_URL || !JWT_SECRET){
 console.warn("Set DATABASE_URL and JWT_SECRET in environment variables.");
}
const pool=new Pool({connectionString:DATABASE_URL,ssl:DATABASE_URL?{rejectUnauthorized:false}:false});
const ai=OPENAI_API_KEY?new OpenAI({apiKey:OPENAI_API_KEY}):null;

async function init(){
 if(!DATABASE_URL)return;
 await pool.query(`CREATE TABLE IF NOT EXISTS users(
 id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,
 age INT,height REAL,weight REAL,activity TEXT,goal TEXT,created_at TIMESTAMPTZ DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS chats(
 id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,
 message TEXT NOT NULL,answer TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS progress(
 id SERIAL PRIMARY KEY,user_id INT REFERENCES users(id) ON DELETE CASCADE,
 activity TEXT NOT NULL,minutes INT DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW())`);
}
init().catch(e=>console.error("DB init:",e));

function auth(req,res,next){
 try{const h=req.headers.authorization||"";const t=h.startsWith("Bearer ")?h.slice(7):"";
 const p=jwt.verify(t,JWT_SECRET);req.userId=p.id;next()
 }catch(e){res.status(401).json({error:"Please login again."})}
}
function cleanUser(r){return {id:r.id,name:r.name,email:r.email,age:r.age,height:r.height,weight:r.weight,activity:r.activity,goal:r.goal}}

app.post("/api/signup",async(req,res)=>{
 try{
  const {name,email,password,age,height,weight,activity,goal}=req.body;
  if(!name||!email||!password)return res.status(400).json({error:"Name, email and password are required."});
  if(password.length<6)return res.status(400).json({error:"Password must be at least 6 characters."});
  const hash=await bcrypt.hash(password,12);
  const q=await pool.query(`INSERT INTO users(name,email,password_hash,age,height,weight,activity,goal)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
  [name,email.toLowerCase().trim(),hash,age||null,height||null,weight||null,activity||"Moderate",goal||"General fitness"]);
  const token=jwt.sign({id:q.rows[0].id},JWT_SECRET,{expiresIn:"30d"});
  res.json({token,user:cleanUser(q.rows[0])})
 }catch(e){res.status(400).json({error:e.code==="23505"?"Email already registered.":e.message})}
});
app.post("/api/login",async(req,res)=>{
 try{
  const {email,password}=req.body;const q=await pool.query("SELECT * FROM users WHERE email=$1",[email.toLowerCase().trim()]);
  if(!q.rows[0]||!(await bcrypt.compare(password,q.rows[0].password_hash)))return res.status(401).json({error:"Invalid email or password."});
  const token=jwt.sign({id:q.rows[0].id},JWT_SECRET,{expiresIn:"30d"});res.json({token,user:cleanUser(q.rows[0])})
 }catch(e){res.status(500).json({error:"Login failed."})}
});
app.get("/api/me",auth,async(req,res)=>{
 const q=await pool.query("SELECT * FROM users WHERE id=$1",[req.userId]);res.json({user:cleanUser(q.rows[0])})
});
app.put("/api/me",auth,async(req,res)=>{
 const {name,age,height,weight,activity,goal}=req.body;
 const q=await pool.query(`UPDATE users SET name=$1,age=$2,height=$3,weight=$4,activity=$5,goal=$6 WHERE id=$7 RETURNING *`,
 [name,age||null,height||null,weight||null,activity,goal,req.userId]);res.json({user:cleanUser(q.rows[0])})
});
app.get("/api/chats",auth,async(req,res)=>{
 const q=await pool.query("SELECT id,message,answer,created_at FROM chats WHERE user_id=$1 ORDER BY id ASC LIMIT 100",[req.userId]);res.json({chats:q.rows})
});
app.post("/api/coach",auth,async(req,res)=>{
 try{
  if(!ai)return res.status(503).json({error:"AI is not configured on the server yet."});
  const {message}=req.body;if(!message)return res.status(400).json({error:"Message required."});
  const u=(await pool.query("SELECT * FROM users WHERE id=$1",[req.userId])).rows[0];
  const system=`You are FitPulse AI Coach. Give safe, age-appropriate general fitness guidance.
User: age ${u.age||"unknown"}, goal ${u.goal||"general fitness"}, activity ${u.activity||"unknown"}, experience not specified.
Do not give dangerous exercise instructions, dehydration advice, steroids/drugs, unsafe supplements, fasting, crash dieting, or calorie-restriction targets. For minors, avoid weight-loss dieting and focus on healthy movement, recovery, hydration and balanced eating. Encourage a parent/guardian or qualified professional when appropriate. Do not diagnose medical conditions. If the user reports severe symptoms, advise seeking urgent medical help. Keep answers practical and concise.`;
  const response=await ai.responses.create({model:process.env.OPENAI_MODEL||"gpt-5.6-mini",input:[{role:"system",content:system},{role:"user",content:message}]});
  const answer=response.output_text||"I couldn't generate a response right now.";
  await pool.query("INSERT INTO chats(user_id,message,answer) VALUES($1,$2,$3)",[req.userId,message,answer]);
  res.json({answer})
 }catch(e){console.error(e);res.status(500).json({error:"AI request failed. Check server configuration."})}
});
app.get("/api/progress",auth,async(req,res)=>{
 const q=await pool.query("SELECT id,activity,minutes,created_at FROM progress WHERE user_id=$1 ORDER BY id DESC LIMIT 100",[req.userId]);res.json({progress:q.rows})
});
app.post("/api/progress",auth,async(req,res)=>{
 const {activity,minutes}=req.body;if(!activity)return res.status(400).json({error:"Activity required."});
 const q=await pool.query("INSERT INTO progress(user_id,activity,minutes) VALUES($1,$2,$3) RETURNING *",[req.userId,activity,Number(minutes)||0]);res.json({progress:q.rows[0]})
});
app.get("/api/health",(req,res)=>res.json({ok:true,app:"FitPulse AI"}));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`FitPulse running on ${PORT}`));
