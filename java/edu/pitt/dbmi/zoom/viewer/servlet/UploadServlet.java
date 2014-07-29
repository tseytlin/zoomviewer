package edu.pitt.dbmi.telepath.viewer.servlet;


import java.io.*;
import java.util.*;

import javax.servlet.*;
import javax.servlet.http.*;
import javax.xml.bind.DatatypeConverter;

/**
 * Managers files for Domain Builder
 * @version 1.0
 */
public class UploadServlet extends HttpServlet {
	// map of all roots
	private Map<String,String> roots;
	
	
	/**
	 *  Initializes the servlet.
	 */
	public void init( ServletConfig config ) throws ServletException {
		super.init( config );
	
		// load init parameter with roots we care to list
		roots = new LinkedHashMap<String, String>();
		for(Enumeration<String> e = config.getInitParameterNames();e.hasMoreElements();){
			String param = e.nextElement();
			if(param.endsWith(".dir")){
				String name = param.substring(0,param.length()-4);
				roots.put(name,config.getInitParameter(param));
			}
		}
	}

	
	/**
	 * used to load an existing project
	 * @param req
	 * @param res
	 * @throws IOException
	 */
	public void doGet( HttpServletRequest req, HttpServletResponse res ) throws IOException {
		res.setContentType("text/plain");
		
		// get action
		String response = "error";
		String action = ""+req.getParameter( "action" );
		if( action.equals( "list" ) ) {
			String path = req.getParameter("path");
			String root = req.getParameter("root");
			String recurse = req.getParameter("recurse");
			if(root != null && roots.containsKey(root)){
				String file = roots.get(root)+"/"+filter(path);
				response = (Boolean.valueOf(recurse))?listRecursive(file,""):list(file);
			}
		}
		res.getWriter().write(response);
	}

	/** Manages the client requests.
	* @param req servlet request
	* @param res servlet response
	*/
	public void doPost( HttpServletRequest req, HttpServletResponse res ) throws IOException {
		res.setContentType("text/plain");
		
		Map map = null;
		
		// if uploading as data and path parameters
		if(req.getParameter("action") != null){
			map = new HashMap();
			for(Object key: req.getParameterMap().keySet()){
				Object val = req.getParameterMap().get(key);
				String value = null;
				if(val instanceof String)
					value = val.toString();
				else if(val instanceof String [])
					value = ((String []) val)[0];
				map.put(""+key, value);
			}
			if(map.containsKey("data"))
				map.put("data",convert(map.get("data")));
		}else{
			// try to read object first, if fail, perhaps AJAX request
			try {
				ObjectInputStream objIn = new ObjectInputStream(req.getInputStream());
				Object obj = objIn.readObject();
				objIn.close();
				// cast object
				if(obj instanceof Map)
					map = (Map) obj;
			} catch ( IOException e ) {
				e.printStackTrace(res.getWriter());
				e.printStackTrace();
				// failed to read stream, perhaps it is not an object
			}catch ( ClassNotFoundException e ) {
				e.printStackTrace(res.getWriter());
				e.printStackTrace();
			}
		}
		
		// process object
		try{
			String r = processPost(map);
			res.getWriter().write(r);
		}catch(IOException ex){
			ex.printStackTrace(res.getWriter());
			ex.printStackTrace();
		}
	}

	/**
	 * convert Base64 data into JPEG byte array
	 * @param data
	 * @return
	 */
	private byte []  convert(Object data) {
		List<String> types = Arrays.asList("data:image/jpeg;base64,","data:image/png;base64,");
		String imageString = data.toString();
		for(String type: types){
			if(imageString.startsWith(type)){
				imageString = imageString.substring(type.length());
				break;
			}
		}
		return DatatypeConverter.parseBase64Binary(imageString);
	}


	/**
	 * process image data
	 * @param map
	 * @return
	 * @throws IOException
	 */
	
	private String processPost(Map map) throws IOException {
		// get action 
		String response = "Error: expecting a Map object";
		
		// if we get a specially formated map, then we are in business
		String action = ""+map.get("action");
		
		if(action.equals("null")){
			response = "Error: action not specified in a map";
		}else if(action.equals("upload")){
			String path = ""+map.get("path");
			String root = ""+map.get("root");
			if(root != null && roots.containsKey(root)){
				// authenticate
				String file = roots.get(root)+"/"+path;
				if(!(new File(file).exists())){
					response = file;
					try{
						byte [] data = (byte []) map.get("data");
						// upload file
						upload(new ByteArrayInputStream(data),file);
						
						//System.err.println(s);
						response = "ok\n";
					}catch(IOException ex){
						throw ex;
					}
				}else{
					response = "Error: file "+file+" already exists";
				}
			}else{
				response = "Error: unkown root "+root;
			}
			
		}
		
		return response;
	}

	
	
	
	/**
	 * 
	 * @param is
	 * @param filename
	 * @throws Exception
	 */
	private void upload(InputStream in, String filename) throws IOException{
		OutputStream out = null;
		try{
			File file = new File(filename);
			if(!file.getParentFile().exists())
				file.getParentFile().mkdirs();
			out = new FileOutputStream(file);
		    byte[] buf = new byte[1024];
		    int len;
		    while ((len = in.read(buf)) > 0){
		    	out.write(buf,0,len);
		    }
		}catch(IOException ex){
			throw ex;
		}finally{
			if(out != null)
				out.close();
		}
	}
	
	/**
	 * list content of director
	 * @param filename
	 * @return
	 */
	private String list(String filename){
		File file = new File(filename);
		if(file.isDirectory()){
			StringBuffer buffer = new StringBuffer();
			for(File f: file.listFiles()){
				if(!f.isHidden() && !f.getName().startsWith("."))
					buffer.append(f.getName()+((f.isDirectory())?"/":"")+"\n");
			}
			return buffer.toString();
		}
		return "error";
	}
	
	/**
	 * list content of director
	 * @param filename
	 * @return
	 */
	private String listRecursive(String filename, String prefix){
		File file = new File(filename);
		if(file.isDirectory()){
			StringBuffer buffer = new StringBuffer();
			for(File f: file.listFiles()){
				if(!f.isHidden() && !f.getName().startsWith(".")){
					if(f.isDirectory()){
						buffer.append(listRecursive(f.getAbsolutePath(),prefix+f.getName()+"/"));
					}else
						buffer.append(prefix+f.getName()+"\n");
				}
			}
			return buffer.toString();
		}
		return "error";
	}
	
	
	/**
	 * filter input string to exclude any non-kosher characters
	 * if input is a password, then "UNENCODE" it
	 * @param str
	 * @return
	 */
	private String filter(String str){
		if(str == null)
			return "";
		
		// strip characters
		return str.replaceAll("[^\\w\\s/\\-@]","");
	}
}

