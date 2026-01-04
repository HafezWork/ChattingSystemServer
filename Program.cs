using Fleck;
using Microsoft.EntityFrameworkCore;
using ChatServerMVC.Models;
using ChatServerMVC.services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using ChatServerMVC.services.Interfaces;
using ChatServerMVC.services.Services;

var builder = WebApplication.CreateBuilder(args);

//
// =====================
// Database (Factory)
// =====================
//
builder.Services.AddDbContextFactory<DataContext>(options =>
{
    var conn = builder.Configuration.GetConnectionString("DefaultConnection");

    options.UseMySql(
        conn,
        ServerVersion.AutoDetect(conn)
    );
});

//
// =====================
// Controllers & Swagger
// =====================
//
builder.Services.AddControllers();
builder.Services.AddSwaggerGen();

//
// =====================
// Application Services
// =====================
//
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IRoomService, RoomService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IMessageService, MessageService>();
builder.Services.AddScoped<IKeyService, KeyService>();

//
// =====================
// WebSocket Services
// =====================
//
builder.Services.AddSingleton<IConnectionRegistry, ConnectionRegistry>();
builder.Services.AddSingleton<WebSocketHandler>();

//
// =====================
// JWT Authentication
// =====================
//
var jwtSettings = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key)
    };
});

//
// =====================
// CORS
// =====================
//
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

//
// =====================
// CORS
// =====================
//
app.UseCors("AllowFrontend");

//
// =====================
// Database + WebSocket startup
// =====================
//
using (var scope = app.Services.CreateScope())
{
    // DB
    var factory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<DataContext>>();
    using var db = factory.CreateDbContext();

    Console.WriteLine("Applying migrations...");
    db.Database.Migrate();
    Console.WriteLine("Database ready.");

    // WebSockets
    var wsHandler = app.Services.GetRequiredService<WebSocketHandler>();
    wsHandler.Start();
}

//
// =====================
// Middleware
// =====================
//
app.UseRouting();

app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.UseWebSockets();

app.MapControllers();

app.Run();
